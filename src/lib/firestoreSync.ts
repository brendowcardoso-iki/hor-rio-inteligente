import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';

export interface UserPreferences {
  accentColor?: string;
  theme?: string;
  sidebarCollapsed?: boolean;
  showFullTimeline?: boolean;
  showVisualCalendar?: boolean;
  profileImage?: string | null;
  backgroundImage?: string | null;
  sidebarBackgroundImage?: string | null;
  selectedIndividualFiles?: any[];
  trashedFiles?: any[];
  parsedCache?: Record<string, any>;
  importGoogleCalendar?: boolean;
}

/**
 * Saves or updates user settings in Firestore
 */
export async function saveFirestoreUserProfile(
  userId: string, 
  email: string, 
  preferences: UserPreferences
) {
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const dataToSave: any = {
      uid: userId,
      email: email || '',
      updatedAt: serverTimestamp(),
    };

    // Only set defined values
    const allowedKeys: (keyof UserPreferences)[] = [
      'accentColor', 'theme', 'sidebarCollapsed', 'showFullTimeline', 'showVisualCalendar',
      'profileImage', 'backgroundImage', 'sidebarBackgroundImage',
      'selectedIndividualFiles', 'trashedFiles', 'parsedCache', 'importGoogleCalendar'
    ];

    allowedKeys.forEach(key => {
      if (preferences[key] !== undefined && preferences[key] !== null) {
        dataToSave[key] = preferences[key];
      }
    });

    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Get user settings from Firestore
 */
export async function getFirestoreUserProfile(userId: string) {
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Saves user’s schedule list in Firestore
 */
export async function saveFirestoreSchedule(userId: string, items: any[]) {
  const path = `users/${userId}/schedule`;
  try {
    const batch = writeBatch(db);

    // 1. Clear current schedule subcollection items to prevent orphans
    const collectionRef = collection(db, 'users', userId, 'schedule');
    const existingSnap = await getDocs(collectionRef);
    existingSnap.forEach(document => {
      batch.delete(document.ref);
    });

    // 2. Add all new items
    items.forEach((item, index) => {
      const cleanActivity = (item.activity || 'Atividade')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      const documentId = `${item.startTime || '00_00'}-${item.endTime || '00_00'}-${cleanActivity}-${index}`;
      const itemRef = doc(db, 'users', userId, 'schedule', documentId);
      
      const payload: any = {
        startTime: item.startTime || '00:00',
        endTime: item.endTime || '01:00',
        activity: item.activity || 'Atividade',
      };
      if (item.instructions) payload.instructions = item.instructions;
      if (item.category) payload.category = item.category;
      if (item.sourceFile) payload.sourceFile = item.sourceFile;

      batch.set(itemRef, payload);
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Load all schedule items of the user
 */
export async function getFirestoreSchedule(userId: string): Promise<any[]> {
  const path = `users/${userId}/schedule`;
  try {
    const collectionRef = collection(db, 'users', userId, 'schedule');
    const snap = await getDocs(collectionRef);
    const results: any[] = [];
    snap.forEach(document => {
      results.push(document.data());
    });
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

/**
 * Saves a single custom activity objective/checklist step in Firestore
 */
export async function saveFirestoreCustomization(
  userId: string, 
  activityKey: string, 
  customizationData: { objective?: string; steps?: any[] }
) {
  // Limit character sizing strictly to match rules matching
  const cleanId = activityKey.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  const path = `users/${userId}/customizations/${cleanId}`;
  try {
    const docRef = doc(db, 'users', userId, 'customizations', cleanId);
    const payload = {
      objective: customizationData.objective || '',
      steps: customizationData.steps || [],
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Load all user customizable objective assets from Firestore
 */
export async function getFirestoreCustomizations(userId: string): Promise<Record<string, any>> {
  const path = `users/${userId}/customizations`;
  try {
    const collectionRef = collection(db, 'users', userId, 'customizations');
    const snap = await getDocs(collectionRef);
    const customizations: Record<string, any> = {};
    snap.forEach(document => {
      customizations[document.id] = document.data();
    });
    return customizations;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return {};
  }
}

/**
 * Saves a user feedback entry in Firestore
 */
export async function saveFirestoreFeedback(
  userId: string,
  feedbackData: {
    activityName: string;
    startTime: string;
    endTime: string;
    feedbackText: string;
    rating: number;
  }
) {
  const randomId = Math.random().toString(36).substring(2, 15);
  const path = `users/${userId}/feedbacks/${randomId}`;
  try {
    const docRef = doc(db, 'users', userId, 'feedbacks', randomId);
    const payload = {
      ...feedbackData,
      createdAt: serverTimestamp()
    };
    await setDoc(docRef, payload);
    return randomId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

