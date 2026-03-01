const admin = require('firebase-admin');

// Initialize Firebase Admin with default credentials if available
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'buck-2ec30'
    });
}

async function test() {
    console.log("Fetching users...");
    const db = admin.firestore();
    const users = await db.collection('users').get();

    users.forEach(doc => {
        console.log("User:", doc.id, JSON.stringify(doc.data(), null, 2));
    });
}

test().catch(console.error);
