import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  Loader2, 
  Sparkles, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight, 
  RotateCw, 
  Layers, 
  ShieldCheck, 
  Database,
  Calendar,
  UploadCloud,
  FileText
} from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { parseWorkoutFile } from '../lib/gemini';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { cn } from '../lib/utils';
import { parseExcelWorkbook } from '../lib/fileParser';

interface GoogleSheetsSyncWidgetProps {
  showToast: (m: string, t?: 'success' | 'error') => void;
  onSyncComplete?: () => void;
}

export function GoogleSheetsSyncWidget({ showToast, onSyncComplete }: GoogleSheetsSyncWidgetProps) {
  const [sourceType, setSourceType] = useState<'google' | 'local'>('google');
  const [localBookSheets, setLocalBookSheets] = useState<Record<string, string[][]>>({});

  const [sheetUrl, setSheetUrl] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<'idle' | 'auth' | 'tabs' | 'download' | 'analyzing' | 'storing' | 'success'>('idle');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  // Custom cell range and specific row/column focus instructions
  const [customRange, setCustomRange] = useState('A1:L80');
  const [userRangeInstructions, setUserRangeInstructions] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Previews & custom row/column selections
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [columnMappings, setColumnMappings] = useState<Record<number, string>>({});
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  
  // High fidelity summary details about synced program
  const [syncedDetails, setSyncedDetails] = useState<{
    name: string;
    category: string;
    exercisesCount: number;
    description: string;
  } | null>(null);

  const getStepPercentage = () => {
    switch (syncStep) {
      case 'idle': return 0;
      case 'auth': return 20;
      case 'tabs': return 40;
      case 'download': return 60;
      case 'analyzing': return 80;
      case 'storing': return 95;
      case 'success': return 100;
      default: return 0;
    }
  };

  const stepsList = [
    { id: 'auth', label: 'OAuth Check', desc: 'Secure Handshake' },
    { id: 'tabs', label: 'Read Structure', desc: 'Listing worksheets' },
    { id: 'download', label: 'Ingest Cells', desc: 'Downloading range matrix' },
    { id: 'analyzing', label: 'GPT Parsing', desc: 'Gemini cognitive modeling' },
    { id: 'storing', label: 'Vault Storage', desc: 'Writing template records' }
  ] as const;

  const getStepStatus = (stepId: 'auth' | 'tabs' | 'download' | 'analyzing' | 'storing') => {
    const order = ['idle', 'auth', 'tabs', 'download', 'analyzing', 'storing', 'success'];
    const currentIndex = order.indexOf(syncStep);
    const stepIndex = order.indexOf(stepId);
    if (currentIndex > stepIndex || syncStep === 'success') return 'completed';
    if (currentIndex === stepIndex) return 'active';
    return 'pending';
  };

  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return (match && match[1]) ? match[1] : null;
  };

  // Reusable intelligent column-mapping auto-detection
  const autoDetectColumnMappings = (rows: string[][]) => {
    const initialMappings: Record<number, string> = {};
    if (rows.length > 0) {
      const colCount = Math.max(...rows.map(r => r.length));
      for (let colIdx = 0; colIdx < colCount; colIdx++) {
        initialMappings[colIdx] = 'ignore';
        
        // Peek first 6 rows for matching terms
        for (let rowIdx = 0; rowIdx < Math.min(6, rows.length); rowIdx++) {
          const cellVal = (rows[rowIdx][colIdx] || '').toString().toLowerCase().trim();
          if (!cellVal) continue;

          if (cellVal.includes('exercise') || cellVal === 'lift' || cellVal === 'movement' || cellVal === 'name' || cellVal === 'drill') {
            initialMappings[colIdx] = 'exercise';
            break;
          } else if (cellVal.includes('sets') || cellVal === 'set') {
            initialMappings[colIdx] = 'sets';
            break;
          } else if (cellVal.includes('reps') || cellVal === 'rep') {
            initialMappings[colIdx] = 'reps';
            break;
          } else if (cellVal.includes('weight') || cellVal === 'load' || cellVal === 'intensity' || cellVal === 'kg' || cellVal === 'lbs') {
            initialMappings[colIdx] = 'weight';
            break;
          } else if (cellVal.includes('rest') || cellVal.includes('interval')) {
            initialMappings[colIdx] = 'rest';
            break;
          } else if (cellVal.includes('note') || cellVal.includes('cue') || cellVal.includes('coach') || cellVal.includes('comment')) {
            initialMappings[colIdx] = 'notes';
            break;
          } else if (cellVal.includes('block') || cellVal === 'phase' || cellVal === 'period') {
            initialMappings[colIdx] = 'block';
            break;
          }
        }
      }

      // Secondary fallback search if mapping is blank
      const hasExercise = Object.values(initialMappings).includes('exercise');
      if (!hasExercise) {
        let found = false;
        for (let col = 0; col < Math.min(colCount, 3); col++) {
          const hasTextVal = rows.some(r => r[col] && r[col].length > 4);
          if (hasTextVal) {
            initialMappings[col] = 'exercise';
            found = true;
            break;
          }
        }
        if (!found && colCount > 0) {
          initialMappings[0] = 'exercise';
        }
      }
    }
    setColumnMappings(initialMappings);
  };

  // Loads a preview of sheets cell values for intelligent mapping & row selectors
  const loadSheetPreview = async (tab: string, token: string, rangeOverride?: string) => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId || !token || !tab) return;

    setIsPreviewLoading(true);
    setPreviewRows([]);
    setErrorDetails(null);

    try {
      const activeRange = rangeOverride || customRange || 'A1:L80';
      const range = `${encodeURIComponent(tab)}!${activeRange}`;
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Could not load preview cells for tab "${tab}" with range "${activeRange}". Make sure sheet is not empty.`);
      }

      const data = await res.json();
      const rows: string[][] = data.values || [];
      setPreviewRows(rows);

      // Pre-check all rows by default
      const initialSelectedRows: Record<number, boolean> = {};
      rows.forEach((_, idx) => {
        initialSelectedRows[idx] = true;
      });
      setSelectedRows(initialSelectedRows);

      autoDetectColumnMappings(rows);

    } catch (err: any) {
      console.error(err);
      setErrorDetails(err.message || 'Error occurred starting spreadsheet preview load.');
      showToast(err.message || 'Error loading preview range.', 'error');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleLocalSpreadsheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPreviewLoading(true);
    setPreviewRows([]);
    setErrorDetails(null);
    setSpreadsheetTitle(file.name);

    try {
      const parsedBook = await parseExcelWorkbook(file);
      setAvailableTabs(parsedBook.sheetNames);
      setLocalBookSheets(parsedBook.sheets);

      if (parsedBook.sheetNames.length > 0) {
        const firstTab = parsedBook.sheetNames[0];
        setSelectedTab(firstTab);

        const rows = parsedBook.sheets[firstTab] || [];
        setPreviewRows(rows);

        // Pre-check all rows by default
        const initialSelectedRows: Record<number, boolean> = {};
        rows.forEach((_, idx) => {
          initialSelectedRows[idx] = true;
        });
        setSelectedRows(initialSelectedRows);

        autoDetectColumnMappings(rows);
      } else {
        throw new Error('No worksheets/tabs detected inside this workbook.');
      }

      // Transition straight into the preview tabs layout!
      setSyncStep('tabs');

    } catch (err: any) {
      console.error(err);
      setErrorDetails(err.message || 'Error parsing local file.');
      showToast(err.message || 'Failed to read local spreadsheet file.', 'error');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleStartSyncFlow = async () => {
    setErrorDetails(null);
    if (!sheetUrl.trim()) {
      showToast('Please paste a valid Google Sheet URL first.', 'error');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      showToast('Invalid Google Sheets URL structure. Please ensure it follows standard format.', 'error');
      return;
    }

    setIsSyncing(true);
    
    // Auto-detect public sheet download feature before prompting auth
    try {
      setSyncStep('download');
      const proxyRes = await fetch(`/api/proxy-sheet?id=${spreadsheetId}`);
      if (proxyRes.ok) {
        const blob = await proxyRes.blob();
        const file = new File([blob], 'public-sheet.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        setIsPreviewLoading(true);
        const parsedBook = await parseExcelWorkbook(file);
        
        setSpreadsheetTitle(parsedBook.sheetNames.length > 0 ? sheetUrl.split('/')[5] || 'Olympic Program' : 'Public Sheet');
        setAvailableTabs(parsedBook.sheetNames);
        setLocalBookSheets(parsedBook.sheets);
        // We do NOT change sourceType here so the user stays on the Google tab mentally!

        if (parsedBook.sheetNames.length > 0) {
          const firstTab = parsedBook.sheetNames[0];
          setSelectedTab(firstTab);

          const rows = parsedBook.sheets[firstTab] || [];
          setPreviewRows(rows);

          // Pre-check all rows by default
          const initialSelectedRows: Record<number, boolean> = {};
          rows.forEach((_, idx) => {
            initialSelectedRows[idx] = true;
          });
          setSelectedRows(initialSelectedRows);

          autoDetectColumnMappings(rows);
        } else {
          throw new Error('No worksheets/tabs detected inside this public workbook.');
        }

        setSyncStep('tabs');
        setIsPreviewLoading(false);
        return; // Early return to bypass OAuth!
      }
    } catch (e) {
      console.warn("Public sheet fast-sync failed, falling back to secure OAuth API:", e);
    }
    
    setSyncStep('auth');

    let currentToken = accessToken;

    try {
      if (!currentToken) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
        
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          currentToken = credential.accessToken;
          setAccessToken(currentToken);
        } else {
          throw new Error('Could not obtain Google Access Token. Please verify authorization permissions.');
        }
      }

      setSyncStep('tabs');

      // Fetch spreadsheet metadata
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          setAccessToken(null);
          throw new Error('Session credentials expired. Please attempt authentication connection again.');
        }
        throw new Error('Could not retrieve spreadsheet metadata. Make sure the spreadsheet is viewable or shared under your Google ID.');
      }

      const data = await res.json();
      setSpreadsheetTitle(data.properties?.title || 'Shared Coaching Sheet');
      
      const tabNames = data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) || [];
      setAvailableTabs(tabNames);
      
      if (tabNames.length > 0) {
        setSelectedTab(tabNames[0]);
        // Trigger non-blocking preview loading immediately
        await loadSheetPreview(tabNames[0], currentToken);
      } else {
        throw new Error('No worksheets/tabs detected inside this spreadsheet.');
      }

    } catch (err: any) {
      console.error(err);
      setErrorDetails(err.message || 'Verification connection failure.');
      showToast(err.message || 'Google Auth Connection issue.', 'error');
      setSyncStep('idle');
      setIsSyncing(false);
    }
  };

  const executeDataSynchronization = async () => {
    if (sourceType === 'google' && (!sheetUrl.trim() || !selectedTab)) return;
    if (sourceType === 'local' && !selectedTab) return;

    const spreadsheetId = sourceType === 'google' ? extractSpreadsheetId(sheetUrl) : null;
    if (sourceType === 'google' && (!spreadsheetId || (!accessToken && !localBookSheets[selectedTab]))) {
      showToast("Access token or valid local sheet data is missing. Please reload the sheet.", "error");
      return;
    }

    setIsSyncing(true);
    setErrorDetails(null);
    setSyncStep(sourceType === 'google' ? 'download' : 'analyzing');

    try {
      let activeRows = previewRows;

      // If previewRows is empty, load it fresh
      if (activeRows.length === 0) {
        if (sourceType === 'google') {
          if (localBookSheets[selectedTab]) {
             activeRows = localBookSheets[selectedTab] || [];
          } else if (accessToken) {
            const finalRange = customRange.trim() || 'A1:L80';
            const range = `${encodeURIComponent(selectedTab)}!${finalRange}`;
            const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!res.ok) {
              throw new Error(`Failed downloading sheet values for range: "${range}". Please check formatting or share settings.`);
            }

            const data = await res.json();
            activeRows = data.values || [];
          }
        } else {
          throw new Error(`The selected tab/range contains no visible cells data.`);
        }
      }

      if (activeRows.length === 0) {
        throw new Error(`The selected tab/range contains no visible cells data.`);
      }

      setSyncStep('analyzing');

      // AI-Powered parsing instead of manual mapping
      const filteredRows = activeRows.filter((_, idx) => selectedRows[idx] !== false);
      if (filteredRows.length === 0) {
        throw new Error("No active rows selected/found. Please check row checkboxes in the visual grid preview.");
      }

      const csvString = filteredRows.map(r => r.join(' | ')).join('\n');

      const parseRes = await fetch('/api/gemini/parse-workout-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileContent: csvString,
          fileName: `${spreadsheetTitle || 'Spreadsheet'} - ${selectedTab}`,
          userRangeInstructions
        })
      });

      if (!parseRes.ok) {
        throw new Error("Failed to generate workout plan from the sheet using AI. Check the document contents.");
      }
      
      const generatedPlan = await parseRes.json();
      
      setSyncStep('storing');

      const hasWeeks = generatedPlan.weeks && Array.isArray(generatedPlan.weeks) && generatedPlan.weeks.length > 0;

      const payload: any = {
        name: generatedPlan.name || `${spreadsheetTitle || 'Synced Protocol'} - ${selectedTab}`,
        category: generatedPlan.category || 'Athletic',
        description: generatedPlan.description || `Synchronized from Sheet: ${spreadsheetTitle} (Tab: ${selectedTab})`,
        notes: generatedPlan.description || `Synchronized from Sheet: ${spreadsheetTitle} (Tab: ${selectedTab})`,
        exercises: generatedPlan.exercises || [],
        createdAt: serverTimestamp(),
        type: hasWeeks ? 'program' : 'workout',
        isSynced: true,
        isCustom: true,
        sourceSheet: spreadsheetTitle,
        sourceTab: selectedTab
      };

      if (hasWeeks) {
        payload.weeks = generatedPlan.weeks;
      }

      // Store in firestore collection 'templates'
      await addDoc(collection(db, 'templates'), payload)
        .catch(err => {
          handleFirestoreError(err, OperationType.CREATE, 'templates');
          throw err;
        });

      let exerciseCount = 0;
      if (hasWeeks) {
        generatedPlan.weeks.forEach((w: any) => {
          w.days?.forEach((d: any) => {
            exerciseCount += d.exercises?.length || 0;
          });
        });
      } else {
        exerciseCount = payload.exercises?.length || 0;
      }

      setSyncedDetails({
        name: payload.name,
        category: payload.category,
        exercisesCount: exerciseCount,
        description: payload.description
      });

      setSyncStep('success');
      showToast(`Training Protocol "${payload.name}" successfully synchronized into the Vault!`, 'success');

      if (onSyncComplete) {
        onSyncComplete();
      }

    } catch (err: any) {
      console.error(err);
      setErrorDetails(err.message || 'Failed complete sync run.');
      showToast(err.message || 'Data sync error.', 'error');
      setSyncStep('tabs');
    } finally {
      setIsSyncing(false);
    }
  };

  const resetWidgetState = () => {
    setSheetUrl('');
    setAvailableTabs([]);
    setSelectedTab('');
    setSpreadsheetTitle('');
    setSyncedDetails(null);
    setSyncStep('idle');
    setErrorDetails(null);
    setIsSyncing(false);
    
    // Clear preview states
    setPreviewRows([]);
    setColumnMappings({});
    setSelectedRows({});
  };

  const getStepText = () => {
    switch (syncStep) {
      case 'auth': return 'Requesting Google Auth...';
      case 'tabs': return 'Loading Spreadsheet structure...';
      case 'download': return 'Downloading cells matrix...';
      case 'analyzing': return 'Gemini AI parsing split structure...';
      case 'storing': return 'Committing layout to secure Vault...';
      default: return 'Processing...';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 25 }}
      className="bg-zinc-900 border border-white/5 rounded-[40px] p-8 relative overflow-hidden group shadow-2xl"
    >
      {/* Visual background accents */}
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
        <FileSpreadsheet className="w-48 h-48 text-orange-500" />
      </div>

      <div className="relative z-10 space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-[#FF5A1F] mb-4">
            <Sparkles className="w-3 h-3 text-orange-500" />
            Active Sync Integration
          </div>
          <h2 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter text-white">
            Olympic <span className="text-zinc-500">Sheet Synchronizer</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-2 max-w-xl leading-relaxed">
            Link and parse any live Google Spreadsheet split into training protocols immediately. Coach Nik's real-time AI analyzes structure, parses rows, formats macros, and populates your team's vault.
          </p>
        </div>

        {/* Input & Form Area */}
        <AnimatePresence mode="wait">
          {syncStep === 'idle' && (
            <motion.div 
              key="idle-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Source Mode Tab Selector */}
              <div className="flex bg-zinc-950 p-1 border border-white/5 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setSourceType('google')}
                  className={cn(
                    "flex-1 py-3 text-xs uppercase tracking-widest font-black rounded-xl transition-all flex items-center justify-center gap-2",
                    sourceType === 'google' 
                      ? "bg-zinc-900 border border-white/10 text-white shadow-md font-extrabold" 
                      : "text-zinc-500 hover:text-zinc-300 font-bold"
                  )}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                  Google Sheets
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('local')}
                  className={cn(
                    "flex-1 py-3 text-xs uppercase tracking-widest font-black rounded-xl transition-all flex items-center justify-center gap-2",
                    sourceType === 'local' 
                      ? "bg-zinc-900 border border-white/10 text-white shadow-md font-extrabold" 
                      : "text-zinc-500 hover:text-zinc-300 font-bold"
                  )}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-orange-500" />
                  Local Excel / CSV
                </button>
              </div>

              {sourceType === 'google' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <input 
                      type="url"
                      placeholder="Paste Google Sheets Shareable URL (e.g. https://docs.google.com/spreadsheets/d/...)"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/5 focus:border-orange-500/50 rounded-2xl py-4 pl-12 pr-4 text-xs font-medium text-white placeholder-zinc-600 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleStartSyncFlow}
                      className="flex-1 px-8 py-4 bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-600 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-500/10"
                    >
                      Connect & Load Cells
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    {accessToken && (
                      <button
                        onClick={() => {
                          setAccessToken(null);
                          showToast('Google credentials cleared.', 'success');
                        }}
                        className="px-6 py-4 bg-zinc-950 border border-white/5 text-zinc-500 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                      >
                        Clear Credentials
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="group relative flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-orange-500/40 bg-zinc-950/50 rounded-3xl p-10 cursor-pointer overflow-hidden transition-all text-center">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.csv" 
                      className="hidden" 
                      onChange={handleLocalSpreadsheetUpload}
                    />
                    <div className="bg-orange-500/10 border border-orange-500/20 p-5 rounded-3xl group-hover:scale-110 transition-transform mb-4">
                      <UploadCloud className="w-8 h-8 text-orange-500" />
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest text-white block">
                      Select Local Spreadsheet file
                    </span>
                    <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mt-2 block">
                      Supports .XLSX, .XLS, or .CSV formats
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-3 max-w-sm leading-relaxed block">
                      Spreadsheets are decoded entirely in your browser. Map visual workout grids, filter rows, and synchronize directly to the Vault.
                    </span>
                  </label>
                </div>
              )}
            </motion.div>
          )}

          {/* Loading Tab Selection Section */}
          {syncStep === 'tabs' && (
            <motion.div 
              key="tab-selection"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4 bg-zinc-950 border border-white/5 rounded-3xl p-6"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-zinc-500 block">Connected Spreadsheet</span>
                  <span className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-1.5 mt-0.5">
                    <Database className="w-3.5 h-3.5 text-orange-500" />
                    {spreadsheetTitle}
                  </span>
                </div>
                <button 
                  onClick={resetWidgetState} 
                  className="text-[10px] font-bold uppercase text-zinc-500 hover:text-white transition-all flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" /> {sourceType === 'google' ? 'Change URL' : 'Change File'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">
                  Select Tab Sheet
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedTab}
                    onChange={(e) => {
                      const newTab = e.target.value;
                      setSelectedTab(newTab);
                      if (sourceType === 'google') {
                        if (localBookSheets[newTab]) {
                          const rows = localBookSheets[newTab] || [];
                          setPreviewRows(rows);
                          const initialSelectedRows: Record<number, boolean> = {};
                          rows.forEach((_, idx) => {
                            initialSelectedRows[idx] = true;
                          });
                          setSelectedRows(initialSelectedRows);
                          autoDetectColumnMappings(rows);
                        } else if (accessToken) {
                          loadSheetPreview(newTab, accessToken);
                        }
                      } else {
                        const rows = localBookSheets[newTab] || [];
                        setPreviewRows(rows);
                        // Pre-check all rows by default
                        const initialSelectedRows: Record<number, boolean> = {};
                        rows.forEach((_, idx) => {
                          initialSelectedRows[idx] = true;
                        });
                        setSelectedRows(initialSelectedRows);
                        autoDetectColumnMappings(rows);
                      }
                    }}
                    className="flex-1 bg-zinc-900 border border-white/5 focus:border-orange-500/50 rounded-2xl p-4 text-xs font-black uppercase text-white tracking-widest focus:outline-none cursor-pointer transition-all"
                  >
                    {availableTabs.map((tab) => (
                      <option key={tab} value={tab} className="bg-zinc-950 text-white font-sans lowercase">
                        {tab}
                      </option>
                    ))}
                  </select>
                  {sourceType === 'google' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (accessToken && selectedTab) {
                          loadSheetPreview(selectedTab, accessToken);
                        }
                      }}
                      disabled={isPreviewLoading}
                      title="Reload sheet values preview"
                      className="px-5 bg-zinc-900 border border-white/5 text-zinc-450 hover:text-white rounded-2xl flex items-center justify-center transition-all disabled:opacity-50"
                    >
                      <RotateCw className={cn("w-4 h-4 text-zinc-400 hover:text-white", isPreviewLoading && "animate-spin")} />
                    </button>
                  )}
                </div>
              </div>

              {/* Loader or Grid Preview */}
              {isPreviewLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-550 bg-zinc-900/10 border border-white/5 rounded-2xl">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500">Retrieving Cell Grid Preview...</span>
                </div>
              ) : previewRows.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FF5A1F] flex items-center gap-1.5">
                      📊 Cell Grid Selection & Mapping
                    </span>
                    <span className="text-[9px] font-mono font-bold text-zinc-500">
                      {previewRows.length} rows loaded • {Object.values(selectedRows).filter(Boolean).length} rows selected
                    </span>
                  </div>

                  {/* Scrollable table container */}
                  <div className="w-full overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900/50 max-h-[300px] overflow-y-auto">
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 bg-zinc-950 z-20 border-b border-white/10 shadow-sm">
                        {/* Row 1: Letters or Labels */}
                        <tr>
                          <th className="p-2.5 w-12 text-center bg-zinc-950">
                            <input
                              type="checkbox"
                              checked={previewRows.length > 0 && previewRows.every((_, idx) => selectedRows[idx] !== false)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const updated: Record<number, boolean> = {};
                                previewRows.forEach((_, idx) => {
                                  updated[idx] = checked;
                                });
                                setSelectedRows(updated);
                              }}
                              className="w-3.5 h-3.5 rounded bg-zinc-950 border-white/10 text-orange-500 focus:ring-0 checked:bg-orange-500 cursor-pointer"
                            />
                          </th>
                          {Array.from({ length: Math.max(...previewRows.map(r => r.length)) }).map((_, colIdx) => (
                            <th key={colIdx} className="p-1 px-2.5 text-[9px] font-mono font-black text-zinc-500 uppercase tracking-widest bg-zinc-950/80 min-w-[125px]">
                              Col {String.fromCharCode(65 + (colIdx % 26))}{colIdx >= 26 ? Math.floor(colIdx / 26) : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans bg-zinc-950/20">
                        {previewRows.map((row, rowIdx) => (
                          <tr 
                            key={rowIdx} 
                            className={cn(
                              "transition-colors",
                              selectedRows[rowIdx] !== false ? "hover:bg-zinc-800/10" : "bg-zinc-950/15 opacity-30 hover:opacity-45"
                            )}
                          >
                            <td className="p-2 w-12 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedRows[rowIdx] !== false}
                                  onChange={(e) => {
                                    setSelectedRows(prev => ({ ...prev, [rowIdx]: e.target.checked }));
                                  }}
                                  className="w-3.5 h-3.5 rounded bg-zinc-950 border-white/10 text-orange-500 focus:ring-0 checked:bg-orange-500 cursor-pointer"
                                />
                                <span className="text-[9px] font-mono font-bold text-zinc-650 block w-4 text-left">
                                  {rowIdx + 1}
                                </span>
                              </div>
                            </td>
                            {Array.from({ length: Math.max(...previewRows.map(r => r.length)) }).map((_, colIdx) => {
                              const cellValue = row[colIdx] || '';
                              return (
                                <td 
                                  key={colIdx} 
                                  className={cn(
                                    "p-2.5 px-3 whitespace-nowrap truncate max-w-[170px] text-[10px] border-r border-white/[0.02]",
                                    "text-white"
                                  )}
                                  title={cellValue}
                                >
                                  {cellValue}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <span className="text-[10px] text-zinc-500 flex items-center gap-1.5 px-1 mt-1 font-medium">
                    💡 <strong>Pro Tip:</strong> Check rows below that you want to include. AI will intelligently parse all columns, blocks, and cues to generate a structured setup.
                  </span>
                </div>
              ) : null}

              {/* Optional Row & Column Attention Settings */}
              <div className="border-t border-white/5 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[#FF5A1F] hover:text-white transition-all py-1.5 px-1 bg-white/[0.01] hover:bg-white/[0.03] rounded-lg border border-white/5"
                >
                  <span className="flex items-center gap-1.5 font-black">⚙️ Range & Extra Settings</span>
                  <span className="text-[9px] font-black font-mono px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                    {showAdvancedSettings ? 'Hide Panel' : 'Settings / Focus Override'}
                  </span>
                </button>

                <AnimatePresence>
                  {showAdvancedSettings && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-4 pt-3"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">
                          Cell Range Override (e.g. A1:H50)
                        </label>
                        <input
                          type="text"
                          value={customRange}
                          onChange={(e) => setCustomRange(e.target.value)}
                          placeholder="A1:L80"
                          className="w-full bg-zinc-900 border border-white/5 focus:border-orange-500/50 rounded-xl p-3 text-xs font-mono font-bold text-white uppercase placeholder-zinc-650 tracking-wider focus:outline-none transition-all"
                        />
                        <span className="text-[9px] text-zinc-500 block">
                          Limit loaded dimensions to skip trailing rows/columns and sync faster.
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-550 block">
                          Specific Row & Column Attention Instructions
                        </label>
                        <textarea
                          value={userRangeInstructions}
                          onChange={(e) => setUserRangeInstructions(e.target.value)}
                          placeholder="e.g. Row 5 to 25 are active workouts. Column B corresponds to Exercise name, Column C corresponds to Sets/Reps schemas, and ignore rest."
                          rows={3}
                          className="w-full bg-zinc-900 border border-white/5 focus:border-orange-500/50 rounded-xl p-3.5 text-xs text-white placeholder-zinc-650 focus:outline-none transition-all resize-none leading-relaxed"
                        />
                        <span className="text-[9px] text-zinc-500 block font-medium">
                          💡 Provide exact cell columns or row offsets to help Gemini isolate values precisely.
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={executeDataSynchronization}
                  disabled={isSyncing || isPreviewLoading}
                  className="flex-1 py-4 bg-gradient-to-r from-orange-500 to-[#FF4500] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate AI Workout Protocol
                </button>
              </div>
            </motion.div>
          )}

          {/* Sync Progress State */}
          {['auth', 'download', 'analyzing', 'storing'].includes(syncStep) && (
            <motion.div 
              key="sync-progress"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 bg-zinc-950 border border-white/5 rounded-3xl p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500/20 rounded-full blur animate-pulse" />
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin relative" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-500 block">Synchronize Status</span>
                    <span className="text-sm font-black text-white uppercase tracking-tight block">
                      {getStepText()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block">Progress</span>
                  <span className="text-sm font-mono font-black text-orange-500">{getStepPercentage()}%</span>
                </div>
              </div>

              {/* High precision horizontal progress bar */}
              <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden relative border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${getStepPercentage()}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                  className="h-full bg-gradient-to-r from-orange-500 to-[#FF4500] rounded-full relative"
                >
                  <div className="absolute inset-0 bg-white/20 opacity-30 animate-pulse" />
                </motion.div>
              </div>

              {/* Interactive step grid modules */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                {stepsList.map((step, idx) => {
                  const status = getStepStatus(step.id);
                  return (
                    <div 
                      key={step.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between space-y-4 relative overflow-hidden",
                        status === 'completed' && "bg-green-500/[0.02] border-green-500/20 text-green-500",
                        status === 'active' && "bg-orange-500/[0.02] border-orange-500/30 text-orange-500 shadow-lg shadow-orange-500/5",
                        status === 'pending' && "bg-zinc-950/40 border-white/5 text-zinc-650"
                      )}
                    >
                      {status === 'active' && (
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 to-red-500 animate-pulse" />
                      )}
                      
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest leading-none",
                          status === 'pending' ? "text-zinc-600" : "text-zinc-400"
                        )}>
                          Step 0{idx + 1}
                        </span>
                        {status === 'completed' ? (
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        ) : status === 'active' ? (
                          <div className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                          </div>
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-zinc-800 shrink-0" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <h4 className={cn(
                          "text-[10px] font-black uppercase tracking-wider block",
                          status === 'pending' ? "text-zinc-650" : (status === 'completed' ? "text-zinc-300" : "text-white")
                        )}>
                          {step.label}
                        </h4>
                        <span className="text-[9px] text-zinc-500 block leading-tight">
                          {step.desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Subtle real-time auxiliary logs */}
              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1 pt-1 justify-center md:justify-start">
                <Database className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <span>Running data ingest on tab context split selection: "{selectedTab || 'Unknown'}"</span>
              </div>
            </motion.div>
          )}

          {/* Sync Success State */}
          {syncStep === 'success' && syncedDetails && (
            <motion.div 
              key="sync-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-green-500/5 border border-green-500/20 rounded-3xl p-6 space-y-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-500 shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-black uppercase text-green-400">Synchronization Complete</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    The split rows have been parsed and securely registered into the **Vault Library**. Athletes can now be assigned this setup instantly.
                  </p>
                </div>
              </div>

              {/* Parsed summary details */}
              <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                  <div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 block">Created Protocol Template</span>
                    <span className="text-xs font-black uppercase text-white tracking-tight block mt-0.5">{syncedDetails.name}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full border border-orange-500/20 shrink-0">
                    {syncedDetails.category}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 block">Parsed Exercises</span>
                    <span className="text-sm font-black text-white mt-1 block font-mono">{syncedDetails.exercisesCount} Active List items</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 block">Origin Tab Scope</span>
                    <span className="text-sm font-black text-white mt-1 block flex items-center gap-1 uppercase truncate">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      {selectedTab}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={resetWidgetState}
                  className="flex-1 py-4 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all"
                >
                  Link another worksheet split
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Notice feedback inside widgets */}
        {errorDetails && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-red-500 text-xs leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold uppercase text-[10px] tracking-widest block mb-0.5">Integration Failure</span>
              {errorDetails}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
