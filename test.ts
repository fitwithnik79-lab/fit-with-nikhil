import admin from 'firebase-admin';

async function testCustomToken() {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: 'gen-lang-client-0278884559'
      });
    }

    console.log("Generating custom token for a dummy user...");
    const token = await admin.auth().createCustomToken('dummy-user-uid');
    console.log("Success! Generated custom token length:", token.length);
    console.log("Token starts with:", token.substring(0, 30));
  } catch (err: any) {
    console.error("Custom token generation failed:", err);
  }
}

testCustomToken();







