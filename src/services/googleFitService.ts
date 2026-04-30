import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import axios from 'axios';

export class GoogleFitService {
  private static AUTH_POPUP: Window | null = null;

  static async connect(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch('/api/auth/google-fit/url');
        if (!response.ok) throw new Error('Failed to get auth URL');
        const { url } = await response.json();

        // Close any existing popup
        if (this.AUTH_POPUP) this.AUTH_POPUP.close();

        this.AUTH_POPUP = window.open(
          url,
          'google_fit_auth',
          'width=600,height=700'
        );

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'GOOGLE_FIT_AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            resolve(event.data.tokens);
          }
        };

        window.addEventListener('message', handleMessage);

        // Check if popup closed manually
        const checkClosed = setInterval(() => {
          if (this.AUTH_POPUP?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            reject(new Error('Auth window closed by user'));
          }
        }, 1000);

      } catch (error) {
        reject(error);
      }
    });
  }

  static async saveTokens(userId: string, tokens: any) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      googleFitTokens: tokens
    });
  }

  static async getValidAccessToken(userId: string): Promise<string | null> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;

    const profile = userSnap.data() as UserProfile;
    const tokens = profile.googleFitTokens;

    if (!tokens) return null;

    // Check if expired (with 5 min buffer)
    const now = Date.now();
    if (tokens.expiry_date && now < tokens.expiry_date - 300000) {
      return tokens.access_token;
    }

    // Need refresh
    if (!tokens.refresh_token) return null;

    try {
      const response = await axios.post('/api/auth/google-fit/refresh', {
        refresh_token: tokens.refresh_token
      });

      const newTokens = {
        ...tokens,
        ...response.data
      };

      await updateDoc(userRef, {
        googleFitTokens: newTokens
      });

      return newTokens.access_token;
    } catch (error) {
      console.error('Failed to refresh Google Fit token:', error);
      return null;
    }
  }

  static async fetchDailySteps(accessToken: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startTimeMillis = today.getTime();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const endTimeMillis = tomorrow.getTime();

    const aggregateUrl = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
    
    const response = await axios.post(
      aggregateUrl,
      {
        aggregateBy: [
          {
            dataTypeName: 'com.google.step_count.delta',
            dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas'
          }
        ],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis,
        endTimeMillis
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let totalSteps = 0;
    const buckets = response.data.bucket;
    if (buckets && buckets.length > 0) {
      buckets.forEach((bucket: any) => {
        if (bucket.dataset && bucket.dataset.length > 0) {
          bucket.dataset.forEach((dataset: any) => {
            if (dataset.point && dataset.point.length > 0) {
              dataset.point.forEach((point: any) => {
                if (point.value && point.value.length > 0) {
                  totalSteps += point.value[0].intVal || 0;
                }
              });
            }
          });
        }
      });
    }

    return totalSteps;
  }
}
