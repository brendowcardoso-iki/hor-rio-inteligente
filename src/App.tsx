import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Upload, Clock, Calendar, CheckCircle2, ChevronRight, AlertCircle, RefreshCw, Folder, FileText, Trash2, X, ChevronLeft, User, Image as ImageIcon, Settings, MoreVertical, RotateCcw, Palette, Moon, Sun, Monitor, Zap, LogOut, LayoutGrid, List, Menu, CalendarRange } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getContrastColor } from './lib/utils';
import { initAuth, googleSignIn, logout, auth } from './lib/firebase';
import { 
  saveFirestoreUserProfile, 
  getFirestoreUserProfile, 
  saveFirestoreSchedule, 
  getFirestoreSchedule, 
  saveFirestoreCustomization, 
  getFirestoreCustomizations,
  saveFirestoreFeedback
} from './lib/firestoreSync';
import { DriveExplorer } from './components/DriveExplorer';
import { TimelineItem } from './components/TimelineItem';
import { ProtocolView } from './components/ProtocolView';
import { VisualCalendar } from './components/VisualCalendar';
import { CATEGORY_MAP } from './constants';
import { DragAccordionHandle } from './components/DragAccordionHandle';

interface ScheduleItem {
  startTime: string;
  endTime: string;
  activity: string;
  instructions?: string;
  category?: string;
  sourceFile?: string;
  id?: string;
}

interface Step {
  title: string;
  description?: string;
  completed?: boolean;
}

interface ActivityCustomization {
  objective?: string;
  steps?: Step[];
}

// Sub-component for time display to avoid full App re-render every second
interface ClockDisplayProps {
  time: Date;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  accentColor: string;
}

const ClockDisplay = React.memo(({ time, selectedDate, setSelectedDate, accentColor }: ClockDisplayProps) => {
  const localDateStr = React.useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" title="Clique para escolher outra data">
        <Calendar className="w-3.5 h-3.5 opacity-60" style={{ color: accentColor }} />
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 hover:underline">
          {selectedDate.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
        <input 
          type="date" 
          value={localDateStr} 
          onChange={(e) => {
            if (e.target.value) {
              const [y, m, d] = e.target.value.split('-').map(Number);
              const newDate = new Date(y, m - 1, d, 12, 0, 0);
              setSelectedDate(newDate);
            }
          }}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
      <div className="h-3 w-[1px] bg-black/10 dark:bg-white/10" />
      <span className="text-sm font-bold tabular-nums" style={{ color: accentColor }}>{time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  );
});
ClockDisplay.displayName = 'ClockDisplay';

const getCategoryFromText = (title: string, instructions: string = ''): string => {
  const text = `${title} ${instructions}`.toLowerCase();
  if (text.includes('trabalho') || text.includes('reunião') || text.includes('office') || text.includes('projeto') || text.includes('cliente')) return 'Trabalho';
  if (text.includes('treino') || text.includes('academia') || text.includes('corrida') || text.includes('saúde') || text.includes('médico') || text.includes('hospital')) return 'Saúde';
  if (text.includes('sono') || text.includes('dormir') || text.includes('descanso') || text.includes('pausa') || text.includes('relaxar')) return 'Descanso';
  if (text.includes('almoço') || text.includes('jantar') || text.includes('café') || text.includes('comer') || text.includes('lanche') || text.includes('comida')) return 'Alimentação';
  if (text.includes('banho') || text.includes('higiene') || text.includes('skincare') || text.includes('vestir')) return 'Higiene';
  if (text.includes('estudo') || text.includes('aula') || text.includes('curso') || text.includes('ler') || text.includes('livro')) return 'Estudo';
  if (text.includes('filme') || text.includes('série') || text.includes('amigos') || text.includes('família') || text.includes('festa') || text.includes('rede social')) return 'Lazer';
  return 'Outros';
};

function getInitialCachedData() {
  if (typeof window === 'undefined') {
    return {
      user: null,
      token: null,
      schedule: [],
      files: [],
      trashed: [],
      cache: {},
      profileImg: null,
      bgImg: null,
      sidebarBgImg: null,
      accent: '#3b82f6',
      theme: 'classic',
      customizations: {},
      sidebarCollapsed: false,
      visualCalendar: false,
      importGoogle: false,
    };
  }

  try {
    const lastUid = localStorage.getItem('lastUserId');
    const token = localStorage.getItem('accessToken');
    const savedUserStr = localStorage.getItem('cachedUser');
    const user = savedUserStr ? JSON.parse(savedUserStr) : null;
    const prefix = lastUid ? `${lastUid}_` : '';

    const get = (key: string) => {
      if (prefix) {
        const val = localStorage.getItem(`${prefix}${key}`);
        if (val !== null) return val;
      }
      return localStorage.getItem(key);
    };

    const scheduleStr = get('schedule');
    const filesStr = get('selectedIndividualFiles');
    const trashedStr = get('trashedFiles');
    const cacheStr = get('parsedCache');
    const customizationsStr = get('activityCustomizations');

    const files = filesStr ? JSON.parse(filesStr) : [];
    const cache = cacheStr ? JSON.parse(cacheStr) : {};
    let schedule = scheduleStr ? JSON.parse(scheduleStr) : [];

    if ((!schedule || schedule.length === 0) && files.length > 0) {
      const timeRegex = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
      schedule = files.flatMap((file: any) => 
        (cache[file.id]?.items || [])
          .filter((item: any) => item && typeof item.startTime === 'string' && typeof item.endTime === 'string' && timeRegex.test(item.startTime) && timeRegex.test(item.endTime))
          .map((item: any) => ({ ...item, sourceFile: file.name }))
      ).map((item: any) => ({
        ...item,
        category: item.category || getCategoryFromText(item.activity, item.instructions)
      })).sort((a: any, b: any) => 
        a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
      );
    }

    return {
      user,
      token,
      schedule,
      files,
      trashed: trashedStr ? JSON.parse(trashedStr) : [],
      cache,
      profileImg: get('profileImage') || null,
      bgImg: get('backgroundImage') || null,
      sidebarBgImg: get('sidebarBackgroundImage') || null,
      accent: get('accentColor') || '#3b82f6',
      theme: get('appTheme') || 'classic',
      customizations: customizationsStr ? JSON.parse(customizationsStr) : {},
      sidebarCollapsed: get('sidebarCollapsed') === 'true',
      visualCalendar: get('showVisualCalendar') === 'true',
      importGoogle: get('importGoogleCalendar') === 'true',
    };
  } catch (e) {
    console.error("Error reading initial cached data:", e);
    return {
      user: null,
      token: null,
      schedule: [],
      files: [],
      trashed: [],
      cache: {},
      profileImg: null,
      bgImg: null,
      sidebarBgImg: null,
      accent: '#3b82f6',
      theme: 'classic',
      customizations: {},
      sidebarCollapsed: false,
      visualCalendar: false,
      importGoogle: false,
    };
  }
}

export default function App() {
  const initialCache = useMemo(() => getInitialCachedData(), []);

  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => initialCache.schedule);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => initialCache.token);
  const [showDrive, setShowDrive] = useState(false);
  const [selectedIndividualFiles, setSelectedIndividualFiles] = useState<any[]>(() => initialCache.files);
  const [trashedFiles, setTrashedFiles] = useState<any[]>(() => initialCache.trashed);
  const [profileImage, setProfileImage] = useState<string | null>(() => initialCache.profileImg);
  const [selectedActivityOverride, setSelectedActivityOverride] = useState<ScheduleItem | null>(null);
  const [confirmTrashId, setConfirmTrashId] = useState<{ id: string, type: 'file' | 'folder' } | null>(null);
  const [showIndividualFilesSection, setShowIndividualFilesSection] = useState(true);
  const [selectedFolders, setSelectedFolders] = useState<any[]>([]);
  const [folderContents, setFolderContents] = useState<Record<string, any[]>>({});
  const [trashedFolders, setTrashedFolders] = useState<any[]>([]);
  const [showFoldersSection, setShowFoldersSection] = useState(false);
  const [parsedCache, setParsedCache] = useState<Record<string, { items: ScheduleItem[], modifiedTime?: string }>>(() => initialCache.cache);
  const [bgImage, setBgImage] = useState<string | null>(() => initialCache.bgImg);
  const [sidebarBgImage, setSidebarBgImage] = useState<string | null>(() => initialCache.sidebarBgImg);
  const [accentColor, setAccentColor] = useState<string>(() => initialCache.accent);
  const [theme, setTheme] = useState<string>(() => initialCache.theme);
  const [showTrash, setShowTrash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadsModal, setShowUploadsModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [showVisualCalendar, setShowVisualCalendar] = useState<boolean>(() => initialCache.visualCalendar);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => initialCache.sidebarCollapsed);
  const [activityCustomizations, setActivityCustomizations] = useState<Record<string, ActivityCustomization>>(() => initialCache.customizations);
  const [importGoogleCalendar, setImportGoogleCalendar] = useState<boolean>(() => initialCache.importGoogle);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const localDateStr = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.getDate() === today.getDate() &&
           selectedDate.getMonth() === today.getMonth() &&
           selectedDate.getFullYear() === today.getFullYear();
  }, [selectedDate]);

  const [feedbackActivity, setFeedbackActivity] = useState<any>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<number | ''>('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [promptedEnds, setPromptedEnds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('promptedFeedbackActivityEnds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('promptedFeedbackActivityEnds', JSON.stringify(promptedEnds));
  }, [promptedEnds]);

  const handleSaveFeedback = async () => {
    if (!feedbackActivity) return;
    if (feedbackRating === '') {
      setError('Por favor, defina uma nota de feedback.');
      return;
    }

    setIsSavingFeedback(true);
    setError(null);

    try {
      // Save to Firestore if user logged in
      if (currentUser) {
        await saveFirestoreFeedback(currentUser.uid, {
          activityName: feedbackActivity.activity,
          startTime: feedbackActivity.startTime,
          endTime: feedbackActivity.endTime,
          feedbackText: feedbackText,
          rating: Number(feedbackRating)
        });
      }

      // Save to Google Drive if authenticated
      if (accessToken) {
        const response = await fetch('/api/feedback/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            feedbackText,
            rating: Number(feedbackRating),
            activityName: feedbackActivity.activity,
            startTime: feedbackActivity.startTime,
            endTime: feedbackActivity.endTime
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Erro ao salvar feedback no Google Drive');
        }
      }

      // Reset fields & close
      setFeedbackActivity(null);
      setFeedbackText('');
      setFeedbackRating('');
    } catch (err: any) {
      console.error('Erro ao salvar feedback:', err);
      setError(`Erro ao salvar feedback: ${err.message}`);
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const [currentUser, setCurrentUser] = useState<any>(() => initialCache.user);
  const [hasLoadedFromFirestore, setHasLoadedFromFirestore] = useState(false);
  const [isDbSyncing, setIsDbSyncing] = useState(false);
  const [authChecking, setAuthChecking] = useState(() => !initialCache.user);
  
  const profileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const sidebarBgInputRef = useRef<HTMLInputElement>(null);

  // Load user data from user-prefixed localStorage on login change
  useEffect(() => {
    if (!currentUser) {
      // Clean everything to strict defaults only when confirmed logged out
      if (!authChecking) {
        setSchedule([]);
        setSelectedIndividualFiles([]);
        setTrashedFiles([]);
        setProfileImage(null);
        setBgImage(null);
        setSidebarBgImage(null);
        setAccentColor('#3b82f6');
        setTheme('classic');
        setActivityCustomizations({});
        setParsedCache({});
        setSelectedFolders([]);
        setFolderContents({});
        setTrashedFolders([]);
        setAccessToken(null);
        setHasLoadedFromFirestore(false);
        setImportGoogleCalendar(false);
      }
      return;
    }

    const uPrefix = `${currentUser.uid}_`;
    const getLocal = (key: string) => localStorage.getItem(`${uPrefix}${key}`);

    try {
      localStorage.setItem('lastUserId', currentUser.uid);
      localStorage.setItem('cachedUser', JSON.stringify({
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL
      }));

      const token = localStorage.getItem('accessToken');
      if (token) setAccessToken(token);

      const pFiles = getLocal('selectedIndividualFiles');
      if (pFiles) setSelectedIndividualFiles(JSON.parse(pFiles));

      const pTrashed = getLocal('trashedFiles');
      if (pTrashed) setTrashedFiles(JSON.parse(pTrashed));

      const pCache = getLocal('parsedCache');
      if (pCache) setParsedCache(JSON.parse(pCache));

      const pImage = getLocal('profileImage');
      if (pImage) setProfileImage(pImage);

      const pBg = getLocal('backgroundImage');
      if (pBg) setBgImage(pBg);

      const pSideBg = getLocal('sidebarBackgroundImage');
      if (pSideBg) setSidebarBgImage(pSideBg);

      const pTheme = getLocal('appTheme');
      if (pTheme) setTheme(pTheme);

      const pSchedule = getLocal('schedule');
      if (pSchedule) setSchedule(JSON.parse(pSchedule));

      const pCustomizations = getLocal('activityCustomizations');
      if (pCustomizations) setActivityCustomizations(JSON.parse(pCustomizations));

      const pCollapsed = getLocal('sidebarCollapsed');
      if (pCollapsed !== null) setSidebarCollapsed(pCollapsed === 'true');

      const pAccentColor = getLocal('accentColor');
      if (pAccentColor) setAccentColor(pAccentColor);

      // Default full timeline/schedule to minimized (false) on app launch
      setShowFullTimeline(false);

      const pVisualCalendar = getLocal('showVisualCalendar');
      if (pVisualCalendar !== null) setShowVisualCalendar(pVisualCalendar === 'true');

      const pImportGoogleCalendar = getLocal('importGoogleCalendar');
      if (pImportGoogleCalendar !== null) setImportGoogleCalendar(pImportGoogleCalendar === 'true');
    } catch (e) {
      console.error("Error loading user-prefixed local fallback storage:", e);
    }
  }, [currentUser, authChecking]);

  // Final user-prefixed state sync to localStorage
  useEffect(() => {
    if (!currentUser) return;

    const uPrefix = `${currentUser.uid}_`;
    localStorage.setItem('lastUserId', currentUser.uid);
    localStorage.setItem('cachedUser', JSON.stringify({
      uid: currentUser.uid,
      displayName: currentUser.displayName,
      email: currentUser.email,
      photoURL: currentUser.photoURL
    }));

    localStorage.setItem(`${uPrefix}selectedIndividualFiles`, JSON.stringify(selectedIndividualFiles));
    localStorage.setItem(`${uPrefix}trashedFiles`, JSON.stringify(trashedFiles));
    localStorage.setItem(`${uPrefix}parsedCache`, JSON.stringify(parsedCache));
    
    if (profileImage) localStorage.setItem(`${uPrefix}profileImage`, profileImage);
    else localStorage.removeItem(`${uPrefix}profileImage`);
    
    if (bgImage) localStorage.setItem(`${uPrefix}backgroundImage`, bgImage);
    else localStorage.removeItem(`${uPrefix}backgroundImage`);
    
    if (sidebarBgImage) localStorage.setItem(`${uPrefix}sidebarBackgroundImage`, sidebarBgImage);
    else localStorage.removeItem(`${uPrefix}sidebarBackgroundImage`);
    
    localStorage.setItem(`${uPrefix}appTheme`, theme);
    localStorage.setItem(`${uPrefix}schedule`, JSON.stringify(schedule));
    localStorage.setItem(`${uPrefix}activityCustomizations`, JSON.stringify(activityCustomizations));
    localStorage.setItem(`${uPrefix}sidebarCollapsed`, String(sidebarCollapsed));
    localStorage.setItem(`${uPrefix}accentColor`, accentColor);
    localStorage.setItem(`${uPrefix}showFullTimeline`, String(showFullTimeline));
    localStorage.setItem(`${uPrefix}showVisualCalendar`, String(showVisualCalendar));
    localStorage.setItem(`${uPrefix}importGoogleCalendar`, String(importGoogleCalendar));
    
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    else localStorage.removeItem('accessToken');
  }, [currentUser, selectedIndividualFiles, trashedFiles, profileImage, schedule, accessToken, bgImage, sidebarBgImage, parsedCache, theme, activityCustomizations, sidebarCollapsed, showFullTimeline, showVisualCalendar, accentColor, importGoogleCalendar]);

  // Load state from Firestore upon user changes
  useEffect(() => {
    if (!currentUser) {
      setHasLoadedFromFirestore(false);
      return;
    }

    const loadUserData = async () => {
      try {
        setIsDbSyncing(true);
        setError(null);

        // 1. Fetch user settings/profile
        const profile = await getFirestoreUserProfile(currentUser.uid);
        if (profile) {
          if (profile.accentColor) setAccentColor(profile.accentColor);
          if (profile.theme) setTheme(profile.theme);
          if (profile.sidebarCollapsed !== undefined) setSidebarCollapsed(profile.sidebarCollapsed);
          // Default full timeline/schedule to minimized (false) on load
          setShowFullTimeline(false);
          if (profile.showVisualCalendar !== undefined) setShowVisualCalendar(profile.showVisualCalendar);
          if (profile.profileImage) setProfileImage(profile.profileImage);
          if (profile.backgroundImage) setBgImage(profile.backgroundImage);
          if (profile.sidebarBackgroundImage) setSidebarBgImage(profile.sidebarBackgroundImage);
          if (profile.selectedIndividualFiles) setSelectedIndividualFiles(profile.selectedIndividualFiles);
          if (profile.trashedFiles) setTrashedFiles(profile.trashedFiles);
          if (profile.parsedCache) setParsedCache(profile.parsedCache);
          if (profile.importGoogleCalendar !== undefined) setImportGoogleCalendar(profile.importGoogleCalendar);
        } else {
          // Initialize fresh cloud record
          await saveFirestoreUserProfile(currentUser.uid, currentUser.email || '', {
            accentColor,
            theme,
            sidebarCollapsed,
            showFullTimeline,
            showVisualCalendar,
            profileImage,
            backgroundImage: bgImage,
            sidebarBackgroundImage: sidebarBgImage,
            selectedIndividualFiles,
            trashedFiles,
            parsedCache,
            importGoogleCalendar
          });
        }

        // 2. Fetch customization plans
        const customizations = await getFirestoreCustomizations(currentUser.uid);
        if (customizations && Object.keys(customizations).length > 0) {
          setActivityCustomizations(customizations as any);
        }

        // 3. Fetch schedule layout
        const firestoreSchedule = await getFirestoreSchedule(currentUser.uid);
        if (firestoreSchedule && firestoreSchedule.length > 0) {
          const sorted = firestoreSchedule.sort((a, b) => 
            a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
          );
          setSchedule(sorted);
        } else if (schedule.length > 0) {
          await saveFirestoreSchedule(currentUser.uid, schedule);
        }

        setHasLoadedFromFirestore(true);
      } catch (err: any) {
        console.error("Error fetching Firestore record:", err);
        setError("Erro ao sincronizar informações na nuvem.");
      } finally {
        setIsDbSyncing(false);
      }
    };

    loadUserData();
  }, [currentUser]);

  // Saves settings modifications to Firestore
  useEffect(() => {
    if (!currentUser || !hasLoadedFromFirestore) return;

    const timer = setTimeout(async () => {
      try {
        await saveFirestoreUserProfile(currentUser.uid, currentUser.email || '', {
          accentColor,
          theme,
          sidebarCollapsed,
          showFullTimeline,
          showVisualCalendar,
          profileImage,
          backgroundImage: bgImage,
          sidebarBackgroundImage: sidebarBgImage,
          selectedIndividualFiles,
          trashedFiles,
          parsedCache,
          importGoogleCalendar
        });
      } catch (err) {
        console.error("Auto profile save error:", err);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    currentUser, hasLoadedFromFirestore, accentColor, theme, 
    sidebarCollapsed, showFullTimeline, showVisualCalendar, 
    profileImage, bgImage, sidebarBgImage, selectedIndividualFiles, trashedFiles, parsedCache, importGoogleCalendar
  ]);

  // Saves schedule additions and editings to Firestore
  useEffect(() => {
    if (!currentUser || !hasLoadedFromFirestore) return;

    const timer = setTimeout(async () => {
      try {
        await saveFirestoreSchedule(currentUser.uid, schedule);
      } catch (err) {
        console.error("Auto schedule save error:", err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentUser, hasLoadedFromFirestore, schedule]);

  // Saves activity plan objectives and checklists modifications
  useEffect(() => {
    if (!currentUser || !hasLoadedFromFirestore) return;

    const saveChanges = async () => {
      try {
        for (const rawKey in activityCustomizations) {
          const cleanId = rawKey.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
          await saveFirestoreCustomization(currentUser.uid, cleanId, activityCustomizations[rawKey]);
        }
      } catch (err) {
        console.error("Auto customization save error:", err);
      }
    };

    const timer = setTimeout(saveChanges, 2000);
    return () => clearTimeout(timer);
  }, [currentUser, hasLoadedFromFirestore, activityCustomizations]);

  useEffect(() => {
    // Clock update: verifica minuto a minuto sem stale closure
    const timer = setInterval(() => {
      setCurrentTime(prev => {
        const now = new Date();
        if (now.getMinutes() !== prev.getMinutes()) {
          return now;
        }
        return prev;
      });
    }, 10000);
    
    const unsubscribe = initAuth(
      (user, token) => {
        setAccessToken(token);
        setCurrentUser(user);
        setAuthChecking(false);
      },
      () => {
        localStorage.removeItem('cachedUser');
        localStorage.removeItem('lastUserId');
        setAccessToken(null);
        setCurrentUser(null);
        setHasLoadedFromFirestore(false);
        setAuthChecking(false);
      }
    );

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const getDuration = useCallback((start: string, end: string) => {
    try {
      const [h1, m1] = start.split(':').map(Number);
      const [h2, m2] = end.split(':').map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60;
      
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      if (hours > 0) return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
      return `${mins}min`;
    } catch {
      return '';
    }
  }, []);

  const currentTimeStr = useMemo(() => {
    return currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }, [currentTime]);

  const currentActivities = useMemo(() => {
    return schedule.filter(item => {
      return currentTimeStr >= item.startTime && currentTimeStr < item.endTime;
    });
  }, [schedule, currentTimeStr]);

  const closestActivity = useMemo(() => {
    if (currentActivities.length > 0) return currentActivities[0];
    // Find the next one
    const future = schedule.filter(item => item.startTime > currentTimeStr);
    if (future.length > 0) return future[0];
    // If all past, return last one
    return schedule[schedule.length - 1];
  }, [schedule, currentActivities, currentTimeStr]);

  const displayedActivity = selectedActivityOverride || closestActivity;

  // Trigger feedback popup automatically when an activity's endTime matches current time
  useEffect(() => {
    if (!isToday || !schedule || schedule.length === 0) return;
    const todayStr = new Date().toLocaleDateString('pt-BR');
    
    const justEnded = schedule.find(item => {
      const key = `${item.activity}-${item.startTime}-${item.endTime}-${todayStr}`;
      return currentTimeStr === item.endTime && !promptedEnds.includes(key);
    });

    if (justEnded) {
      const key = `${justEnded.activity}-${justEnded.startTime}-${justEnded.endTime}-${todayStr}`;
      setPromptedEnds(prev => [...prev, key]);
      setFeedbackActivity(justEnded);
      setFeedbackText('');
      setFeedbackRating('');
    }
  }, [currentTimeStr, schedule, promptedEnds, isToday]);

  const handleMoveToTrash = (id: string, type?: 'file' | 'folder') => {
    const now = Date.now();
    const file = selectedIndividualFiles.find(f => f.id === id);
    if (file) {
      setTrashedFiles(prev => [...prev, { ...file, trashedAt: now }]);
      setSelectedIndividualFiles(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleRestoreFromTrash = (id: string) => {
    const file = trashedFiles.find(f => f.id === id);
    if (file) {
      setSelectedIndividualFiles(prev => [...prev, file]);
      setTrashedFiles(prev => prev.filter(f => f.id !== id));
    }
  };

  const handlePermanentDelete = (id: string) => {
    setTrashedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateActivityTime = useCallback((activityToUpdate: any, newStartTime: string, newEndTime: string) => {
    if (!activityToUpdate) return;
    
    // 1. Atualizar no schedule principal
    setSchedule(prev => prev.map(item => {
      if (
        item.activity === activityToUpdate.activity &&
        item.startTime === activityToUpdate.startTime &&
        item.endTime === activityToUpdate.endTime &&
        item.sourceFile === activityToUpdate.sourceFile
      ) {
        return {
          ...item,
          startTime: newStartTime,
          endTime: newEndTime
        };
      }
      return item;
    }).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)));

    // 2. Sincronizar e persistir no parsedCache de onde o item veio
    setParsedCache(prev => {
      const newCache = { ...prev };
      let updated = false;
      for (const fileId in newCache) {
        const fileCache = newCache[fileId];
        if (fileCache && Array.isArray(fileCache.items)) {
          const updatedItems = fileCache.items.map((item: any) => {
            if (
              item.activity === activityToUpdate.activity &&
              item.startTime === activityToUpdate.startTime &&
              item.endTime === activityToUpdate.endTime
            ) {
              updated = true;
              return {
                ...item,
                startTime: newStartTime,
                endTime: newEndTime
              };
            }
            return item;
          });
          if (updated) {
            newCache[fileId] = {
              ...fileCache,
              items: updatedItems
            };
            break;
          }
        }
      }
      return newCache;
    });

    // 3. Manter a atividade ativa atualizada simultaneamente se for a editada
    setSelectedActivityOverride(prev => {
      if (
        prev &&
        prev.activity === activityToUpdate.activity &&
        prev.startTime === activityToUpdate.startTime &&
        prev.endTime === activityToUpdate.endTime &&
        prev.sourceFile === activityToUpdate.sourceFile
      ) {
        return {
          ...prev,
          startTime: newStartTime,
          endTime: newEndTime
        };
      }
      return prev;
    });
  }, []);

  const themes = [
    // --- Claro (Light Themes) ---
    { id: 'classic', name: 'Claro Clássico', icon: <Sun className="w-4 h-4" />, colors: { bg: 'bg-[#f0f4f9]', primary: '#3b82f6', text: 'text-[#111111]', sub: 'text-[#2a2c30]', border: 'border-[#dadce0]' } },
    { id: 'nordic', name: 'Claro Nórdico', icon: <Palette className="w-4 h-4" />, colors: { bg: 'bg-[#f5f7fa]', primary: '#3b82f6', text: 'text-[#0a0a0c]', sub: 'text-[#334155]', border: 'border-[#e2e8f0]' } },
    
    // --- Preto e Branco (Black and White Themes) ---
    { id: 'monochrome-light', name: 'Claro P&B', icon: <Monitor className="w-4 h-4" />, colors: { bg: 'bg-white', primary: '#000000', text: 'text-black', sub: 'text-[#1a1a1a]', border: 'border-black' } },
    { id: 'monochrome-dark', name: 'Escuro P&B', icon: <Monitor className="w-4 h-4" />, colors: { bg: 'bg-black', primary: '#ffffff', text: 'text-white', sub: 'text-[#cccccc]', border: 'border-white/20' } },
    
    // --- Escuro (Dark Themes) ---
    { id: 'dark', name: 'Escuro Moderno', icon: <Moon className="w-4 h-4" />, colors: { bg: 'bg-[#15171c]', primary: '#a8c7fa', text: 'text-[#e3e3e3]', sub: 'text-[#c4c7c5]', border: 'border-[#3c4043]' } },
    { id: 'oled', name: 'Escuro Total', icon: <Zap className="w-4 h-4" />, colors: { bg: 'bg-black', primary: '#ffffff', text: 'text-white', sub: 'text-[#f0f0f0]', border: 'border-[#222222]' } },
    { id: 'neon-cyan', name: 'Escuro Futuro', icon: <Palette className="w-4 h-4" />, colors: { bg: 'bg-[#0b0f19]', primary: '#00f2fe', text: 'text-[#e2e8f0]', sub: 'text-[#94a3b8]', border: 'border-[#1e293b]' } },
  ];

  const currentThemeData = themes.find(t => t.id === theme) || themes[0];

  const getConcurrentCount = useMemo(() => {
    return schedule.filter(item => currentTimeStr >= item.startTime && currentTimeStr < item.endTime).length;
  }, [schedule, currentTimeStr]);

  const [syncProgress, setSyncProgress] = useState<{ current: number, total: number } | null>(null);
  const [syncPercentage, setSyncPercentage] = useState<number | null>(null);

  const runQueue = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> => {
    const results: R[] = [];
    const executing = new Set<Promise<void>>();
    
    for (const item of items) {
      if (signal?.aborted) break;
      const promise = fn(item).then(res => {
        results.push(res);
        executing.delete(promise);
      });
      executing.add(promise);
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
    return results;
  };

  const fetchGoogleCalendarEvents = useCallback(async (targetDate: Date = selectedDate) => {
    if (!accessToken) return [];
    try {
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

      const timeMin = startOfDay.toISOString();
      const timeMax = endOfDay.toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleAuthError();
        }
        throw new Error('Falha ao buscar eventos do Google Calendar');
      }

      const data = await res.json();
      const events = data.items || [];

      const googleItems = events.map((event: any) => {
        let startTime = '09:00';
        let endTime = '10:00';

        if (event.start?.dateTime) {
          const startDt = new Date(event.start.dateTime);
          startTime = startDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
        } else if (event.start?.date) {
          startTime = '00:00';
        }

        if (event.end?.dateTime) {
          const endDt = new Date(event.end.dateTime);
          endTime = endDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
        } else if (event.end?.date) {
          endTime = '23:59';
        }

        const activity = event.summary || 'Atividade Sem Nome';
        const instructions = event.description || '';
        const category = getCategoryFromText(activity, instructions);

        return {
          startTime,
          endTime,
          activity,
          instructions,
          category,
          sourceFile: 'Google Agenda'
        };
      });

      return googleItems;
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      return [];
    }
  }, [accessToken, selectedDate]);

  const handleSyncAgendas = useCallback(async (forceFiles?: any[], isManualForce: boolean = false) => {
    const isForcedAction = isManualForce || !!forceFiles;
    if (((loading || isSyncing) && !isForcedAction) || !accessToken) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    if (isManualForce || schedule.length === 0) setLoading(true);
    else setIsSyncing(true);
    
    setError(null);
    setSyncProgress(null);
    setSyncPercentage(0);

    let progressInterval: any = null;

    try {
      let updatedIndividualFiles = [...selectedIndividualFiles];

      // 1. Parallel Meta-Sync
      if (isManualForce) {
        setSyncPercentage(3);
        const fileTasks = selectedIndividualFiles.map(async (file) => {
          try {
            const url = `https://www.googleapis.com/drive/v3/files/${file.id}?fields=id,name,mimeType,modifiedTime`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
            if (!res.ok) return file;
            return await res.json();
          } catch (e) {
            return file;
          }
        });

        const refreshedFiles = await Promise.all(fileTasks);
        updatedIndividualFiles = refreshedFiles;
        setSelectedIndividualFiles(updatedIndividualFiles);
      }

      // 2. Resolve Files to Sync
      let filesToSyncRaw = forceFiles;
      if (!filesToSyncRaw) {
        filesToSyncRaw = [...updatedIndividualFiles];
      }

      const seenIds = new Set();
      const filesToSync = filesToSyncRaw.filter(f => {
        if (!f || !f.id || seenIds.has(f.id) || f.mimeType === 'application/vnd.google-apps.folder') return false;
        seenIds.add(f.id);
        return true;
      });

      // 3. Identification & Caching
      const filesNeedingParse = filesToSync.filter(f => {
        if (isManualForce) return true;
        const cached = parsedCache[f.id];
        if (!cached || !cached.items || cached.items.length === 0) return true;
        if (f.modifiedTime && cached.modifiedTime !== f.modifiedTime) return true;
        return false;
      });

      let finalScheduleItems: ScheduleItem[] = [];

      if (filesNeedingParse.length === 0) {
        setSyncPercentage(100);
        const timeRegex = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
        finalScheduleItems = filesToSync.flatMap(file => 
          (parsedCache[file.id]?.items || [])
            .filter(item => item && typeof item.startTime === 'string' && typeof item.endTime === 'string' && timeRegex.test(item.startTime) && timeRegex.test(item.endTime))
            .map(item => ({ ...item, sourceFile: file.name }))
        );
      } else {
        // 4. Queue-Based Download (represents 5% to 45% progress)
        setSyncPercentage(5);
        setSyncProgress({ current: 0, total: filesNeedingParse.length });
        const newCache = { ...parsedCache };
        const fileContentsMap: Record<string, string> = {};
        let downloadedCount = 0;

        await runQueue(filesNeedingParse, 15, async (file) => {
          try {
            const text = await getFileContent(file);
            const trimmed = text?.trim();
            if (trimmed) {
              fileContentsMap[file.id] = text;
            } else {
              // Limpar imediatamente arquivos que ficaram vazios ou sem conteúdo
              newCache[file.id] = { items: [], modifiedTime: file.modifiedTime };
            }
            downloadedCount++;
            
            const dlPct = Math.round((downloadedCount / filesNeedingParse.length) * 40);
            setSyncPercentage(5 + dlPct);
            setSyncProgress({ current: downloadedCount, total: filesNeedingParse.length });
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              if (e.message === 'Sessão expirada') {
                console.warn(`Sessão expirada ao carregar ${file.name}`);
              } else {
                console.error(`Erro ao baixar ${file.name}:`, e);
              }
            }
            // Em caso de erro ao ler/baixar, definimos como vazio para evitar exibir cache obsoleto ou quebrado
            newCache[file.id] = { items: [], modifiedTime: file.modifiedTime };
            downloadedCount++;
            const dlPct = Math.round((downloadedCount / filesNeedingParse.length) * 40);
            setSyncPercentage(5 + dlPct);
          }
        }, signal);

        if (signal.aborted) return;

        // 5. Intelligent Batch Parsing (represents 45% to 95% progress)
        const fileIdsToParse = Object.keys(fileContentsMap);
        if (fileIdsToParse.length > 0) {
          setSyncPercentage(45);

          // Smoothly increment the percentage during the fast API request
          progressInterval = setInterval(() => {
            setSyncPercentage(prev => {
              if (prev === null || prev >= 95) return prev;
              const step = prev < 75 ? 3 : 1;
              return prev + step;
            });
          }, 100);

          const batchSize = 4;
          const batches = [];
          for (let i = 0; i < fileIdsToParse.length; i += batchSize) {
            const batchIds = fileIdsToParse.slice(i, i + batchSize);
            batches.push(batchIds.map(id => ({ id, text: fileContentsMap[id] })));
          }

          await runQueue(batches, 1, async (batchItems) => {
            try {
              const results = await parseBatch(batchItems);
              results.forEach((res: any) => {
                if (res.id && Array.isArray(res.schedule)) {
                  const fMeta = filesNeedingParse.find(f => f.id === res.id);
                  newCache[res.id] = { items: res.schedule, modifiedTime: fMeta?.modifiedTime };
                }
              });
            } catch (e) {
              console.error("Batch parse error:", e);
            }
          }, signal);
        }

        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        setSyncPercentage(100);

        const timeRegex = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
        finalScheduleItems = filesToSync.flatMap(file => 
          (newCache[file.id]?.items || [])
            .filter(item => item && typeof item.startTime === 'string' && typeof item.endTime === 'string' && timeRegex.test(item.startTime) && timeRegex.test(item.endTime))
            .map(item => ({ ...item, sourceFile: file.name }))
        );
        setParsedCache(newCache);
      }

      let googleCalendarItems: ScheduleItem[] = [];
      if (importGoogleCalendar) {
        googleCalendarItems = await fetchGoogleCalendarEvents(selectedDate);
      }

      const combined = [...finalScheduleItems, ...googleCalendarItems].map(item => ({
        ...item,
        category: item.category || getCategoryFromText(item.activity, item.instructions)
      })).sort((a, b) => 
        a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
      );

      setSchedule(combined);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError('Erro na sincronização');
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setLoading(false);
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncPercentage(null);
    }
  }, [accessToken, loading, isSyncing, selectedIndividualFiles, parsedCache, importGoogleCalendar, fetchGoogleCalendarEvents, selectedDate]);

  const prevImportGoogleRef = useRef<boolean>(importGoogleCalendar);
  const prevDateStrRef = useRef<string>(localDateStr);
  const isFirstMountRef = useRef<boolean>(true);

  // Sincronização inteligente com preservação total de cache:
  // NÃO re-baixa arquivos ou chama IA ao entrar novamente na página.
  // Somente sincroniza quando o usuário ativamente muda a data ou liga/desliga a Google Agenda.
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevImportGoogleRef.current = importGoogleCalendar;
      prevDateStrRef.current = localDateStr;
      return;
    }

    const dateChanged = prevDateStrRef.current !== localDateStr;
    const googleToggled = prevImportGoogleRef.current !== importGoogleCalendar;

    prevDateStrRef.current = localDateStr;
    prevImportGoogleRef.current = importGoogleCalendar;

    if (!dateChanged && !googleToggled) return;

    if (accessToken) {
      // isManualForce: false para utilizar o parsedCache e apenas atualizar os eventos de calendário
      handleSyncAgendas(undefined, false);
    }
  }, [importGoogleCalendar, localDateStr, accessToken, handleSyncAgendas]);

  const parseBatch = async (items: { id: string, text: string }[]) => {
    const maxRetries = 3;
    let delay = 1500;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch('/api/parse-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro no processamento em lote');
        }
        return await res.json();
      } catch (err: any) {
        if (attempt === maxRetries - 1) {
          throw err;
        }
        console.warn(`[ParseBatch] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const handleOpenExplorer = async () => {
    if (loading) return;
    if (!accessToken) {
      try {
        const result = await googleSignIn();
        if (result) {
          setAccessToken(result.accessToken);
          setShowDrive(true);
        }
      } catch (err: any) {
        const isCancelled = err && (
          err.code === 'auth/cancelled-popup-request' || 
          err.code === 'auth/popup-closed-by-user' ||
          (err.message && (err.message.includes('popup-closed-by-user') || err.message.includes('cancelled-popup-request')))
        );
        if (!isCancelled) {
          console.error("Open file explorer failed:", err);
          setError('Falha na autenticação');
        } else {
          console.log("Explorer file auth popup cancelled or closed by user");
        }
      }
    } else {
      setShowDrive(true);
    }
  };

  const handleAuthError = () => {
    setAccessToken(null);
    localStorage.removeItem('accessToken');
    logout();
    setError('Sessão expirada. Por favor, autentique-se novamente.');
  };

  const handleReauthenticate = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await googleSignIn();
      if (result) {
        setAccessToken(result.accessToken);
        // Automatically trigger sync after successful reauth
        setTimeout(() => {
          handleSyncAgendas(undefined, true);
        }, 100);
      }
    } catch (err: any) {
      const isCancelled = err && (
        err.code === 'auth/cancelled-popup-request' || 
        err.code === 'auth/popup-closed-by-user' ||
        (err.message && (err.message.includes('popup-closed-by-user') || err.message.includes('cancelled-popup-request')))
      );
      if (!isCancelled) {
        console.error("Reauthentication failed:", err);
        setError('Falha na autenticação');
      } else {
        console.log("Reauthentication cancelled by user");
      }
    } finally {
      setLoading(false);
    }
  };

  const getFileContent = async (file: any) => {
    const fileId = file.id;
    const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
    
    let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    if (isGoogleDoc) {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    }
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (res.status === 401) {
      handleAuthError();
      throw new Error("Sessão expirada");
    }

    if (!res.ok) throw new Error(`Falha ao baixar arquivo ${file.name}`);
    return await res.text();
  };

  const parseText = async (text: string) => {
    const parseRes = await fetch('/api/parse-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await parseRes.json();
    if (Array.isArray(data)) return data;
    throw new Error(data.error || 'Erro ao processar cronograma');
  };

  const handleDriveSelect = async (files: any[], folders: any[]) => {
    setShowDrive(false);
    setLoading(true);
    setError(null);

    try {
      // Unique sets for merger
      const mergedIndividualFiles = [...selectedIndividualFiles];
      const existingFileIds = new Set(mergedIndividualFiles.map(f => f.id));
      files.forEach(f => {
        if (!existingFileIds.has(f.id)) mergedIndividualFiles.push(f);
      });
      setSelectedIndividualFiles(mergedIndividualFiles);

      // Deduplicate by ID and ensure only files
      const seenIds = new Set();
      const filesToSync = mergedIndividualFiles.filter(f => {
        if (seenIds.has(f.id) || f.mimeType === 'application/vnd.google-apps.folder') return false;
        seenIds.add(f.id);
        return true;
      });

      // 2. Sync immediately
      await handleSyncAgendas(filesToSync);

    } catch (err: any) {
      console.error('Drive selection error:', err);
      setError(err.message || 'Falha ao processar seleção do Drive');
      setLoading(false);
    }
  };

  const removeFilePermanent = (id: string) => {
    handleMoveToTrash(id);
  };

  const moveToTrashFile = (id: string) => {
    const file = selectedIndividualFiles.find(f => f.id === id);
    if (file) {
      setSelectedIndividualFiles(prev => prev.filter(f => f.id !== id));
      setTrashedFiles(prev => [...prev, { ...file, deletedAt: Date.now() }]);
    }
    setConfirmTrashId(null);
  };

  const restoreFile = (id: string) => {
    const file = trashedFiles.find(f => f.id === id);
    if (file) {
      setTrashedFiles(prev => prev.filter(f => f.id !== id));
      setSelectedIndividualFiles(prev => [...prev, file]);
    }
  };

  const deletePermanentFile = (id: string) => {
    setTrashedFiles(prev => prev.filter(f => f.id !== id));
    setParsedCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setProfileImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setBgImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSidebarBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setSidebarBgImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const accentColors = [
    { id: 'royal', color: '#3b82f6', label: 'Azul Royal' },
    { id: 'indigo', color: '#4f46e5', label: 'Azul Índigo' },
    { id: 'cobalto', color: '#2563eb', label: 'Azul Cobalto' },
    { id: 'oceanico', color: '#0f4c81', label: 'Azul Oceânico' },
    { id: 'celeste', color: '#0ea5e9', label: 'Azul Celeste' },
    { id: 'turquesa', color: '#00a3c4', label: 'Azul Turquesa' },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse-schedule', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Falha ao processar arquivo');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSchedule(data);
      } else {
        setError(data.error || 'Erro ao processar arquivo');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportToDocs = async () => {
    if (exporting || !accessToken || schedule.length === 0) return;

    setExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/docs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, schedule })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao exportar para o Google Docs');
      }

      const { url } = await res.json();
      window.open(url, '_blank');
    } catch (err: any) {
      console.error('Export error:', err);
      setError(err.message || 'Erro ao exportar documento');
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = useCallback(() => {
    logout();
    setCurrentUser(null);
    setAccessToken(null);
    setHasLoadedFromFirestore(false);
    
    // Reset all local states to clean defaults
    setSchedule([]);
    setSelectedDate(new Date());
    setSelectedIndividualFiles([]);
    setTrashedFiles([]);
    setProfileImage(null);
    setBgImage(null);
    setSidebarBgImage(null);
    setAccentColor('#3b82f6');
    setTheme('classic');
    setActivityCustomizations({});
    setParsedCache({});
    setSelectedFolders([]);
    setFolderContents({});
    setTrashedFolders([]);
    
    // Clean all user related items in localStorage to prevent leaks
    localStorage.removeItem('cachedUser');
    localStorage.removeItem('lastUserId');
    localStorage.removeItem('schedule');
    localStorage.removeItem('selectedIndividualFiles');
    localStorage.removeItem('trashedFiles');
    localStorage.removeItem('profileImage');
    localStorage.removeItem('backgroundImage');
    localStorage.removeItem('sidebarBackgroundImage');
    localStorage.removeItem('appTheme');
    localStorage.removeItem('activityCustomizations');
    localStorage.removeItem('parsedCache');
    localStorage.removeItem('accessToken');
  }, []);

  const isDark = ['dark', 'oled', 'monochrome-dark', 'neon-cyan'].includes(theme);

  if (authChecking) {
    return (
      <div className="flex flex-col h-screen w-screen items-center justify-center bg-[#f8f9fa] dark:bg-[#141517] font-sans">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
          <p className="text-xs font-bold uppercase tracking-widest opacity-50 text-neutral-500 dark:text-neutral-400">Verificando Credenciais...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div 
        className="flex h-screen w-screen items-center justify-center bg-[#f4f6fa] dark:bg-[#0c0d0e] p-4 font-sans select-none"
        style={{
          backgroundImage: bgImage ? `linear-gradient(rgba(12,13,14,0.65), rgba(12,13,14,0.65)), url(${bgImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md bg-white dark:bg-[#1c1d1f] border border-black/[0.06] dark:border-white/[0.05] shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-8 flex flex-col items-center relative overflow-hidden"
        >
          {/* Accent decoration line */}
          <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: accentColor }} />

          {/* Top Lock Badge */}
          <div 
            className="w-14 h-14 rounded-full flex items-center justify-center mb-6 shadow-md"
            style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
          >
            <CalendarRange className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-extrabold uppercase tracking-wider text-neutral-800 dark:text-neutral-100 font-display mb-2 text-center">
            Protocolo Elite
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 mb-6 text-center">
            Gestão Autônoma de Rotina
          </p>

          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 mb-8 text-center max-w-xs">
            Sincronize seu cronograma com o Google Calendar de maneira segura e acesse sua agenda em tempo real.
          </p>

          <button
            onClick={async () => {
              try {
                setLoading(true);
                const result = await googleSignIn();
                if (result) {
                  localStorage.setItem('accessToken', result.accessToken);
                  localStorage.setItem('lastUserId', result.user.uid);
                  localStorage.setItem('cachedUser', JSON.stringify({
                    uid: result.user.uid,
                    displayName: result.user.displayName,
                    email: result.user.email,
                    photoURL: result.user.photoURL
                  }));
                  setAccessToken(result.accessToken);
                  setCurrentUser(result.user);
                }
              } catch (err: any) {
                const isCancelled = err && (
                  err.code === 'auth/cancelled-popup-request' || 
                  err.code === 'auth/popup-closed-by-user' ||
                  (err.message && (err.message.includes('popup-closed-by-user') || err.message.includes('cancelled-popup-request')))
                );
                if (!isCancelled) {
                  console.error("Login failed:", err);
                  setError('Falha na autenticação');
                } else {
                  console.log("Login popup was closed or cancelled by the user");
                }
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-none text-xs font-bold transition-all active:scale-95 shadow-sm bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Entrar com o Google</span>
              </>
            )}
          </button>
          
          <div className="mt-8 flex items-center justify-between w-full text-[10px] text-neutral-400 dark:text-neutral-500 tracking-wider font-mono">
            <span>PLATAFORMA CRONOS</span>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-none animate-pulse shadow-[0_0_8px_#10b981]" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex flex-col h-screen overflow-hidden font-sans transition-all",
        currentThemeData.colors.bg,
        currentThemeData.colors.text
      )}
      style={{ 
        backgroundImage: bgImage ? `linear-gradient(${isDark ? 'rgba(0,0,0,0.8), rgba(0,0,0,0.8)' : 'rgba(240, 244, 249, 0.8), rgba(240, 244, 249, 0.8)'}), url(${bgImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className={cn("flex flex-col h-full", bgImage && "bg-black/10 backdrop-blur-[2px]")}>
        <AnimatePresence>
        {feedbackActivity && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFeedbackActivity(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              className={cn(
                "relative w-full max-w-lg rounded-none shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
                isDark ? "bg-[#1f2123] text-white border border-white/5" : "bg-white text-[#1f1f1f] border border-[#e1e3e1]"
              )}
            >
              {/* Header */}
              <div className={cn("px-8 py-6 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-[#f1f3f4]")}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-none flex items-center justify-center" style={{ backgroundColor: `${accentColor}1A` }}>
                    <FileText className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Qual o feedback?</h2>
                    <p className="text-[10px] uppercase font-extrabold tracking-wider opacity-45">Avaliação do período</p>
                  </div>
                </div>
                <button 
                  onClick={() => setFeedbackActivity(null)}
                  className={cn("w-8 h-8 rounded-none flex items-center justify-center transition-all", isDark ? "hover:bg-white/5" : "hover:bg-black/5")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* Context Activity Block */}
                <div className={cn("p-4 rounded-none border border-dashed flex flex-col gap-1", isDark ? "border-white/10 bg-white/[0.01]" : "border-black/10 bg-black/[0.01]")}>
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">Atividade Finalizada</span>
                  <span className="text-base font-bold">{feedbackActivity.activity}</span>
                  <div className="flex items-center gap-1.5 text-xs opacity-65">
                    <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <span>{feedbackActivity.startTime} — {feedbackActivity.endTime}</span>
                    <span>•</span>
                    <span>{getDuration(feedbackActivity.startTime, feedbackActivity.endTime)}</span>
                  </div>
                </div>

                {/* Rating Input Field */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70">
                    Defina uma Nota (1 a 10)
                  </label>
                  
                  {/* Selectable score grid */}
                  <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFeedbackRating(num)}
                        className={cn(
                          "py-2 font-mono text-sm font-bold border rounded-none transition-all cursor-pointer",
                          feedbackRating === num
                            ? "border-transparent text-white"
                            : (isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-[#dadce0] text-zinc-600 hover:bg-black/5")
                        )}
                        style={feedbackRating === num ? { backgroundColor: accentColor } : {}}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  {/* Manual input selector */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs opacity-50">Ou digite o número:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={feedbackRating}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') setFeedbackRating('');
                        else {
                          const num = Number(val);
                          if (num >= 1 && num <= 10) setFeedbackRating(num);
                        }
                      }}
                      className={cn(
                        "w-20 px-3 py-1.5 rounded-none border text-center font-mono font-bold text-sm focus:outline-none focus:ring-1",
                        isDark ? "bg-[#25282b] border-white/10 focus:ring-white/20" : "bg-white border-[#dadce0] focus:ring-black/20"
                      )}
                    />
                  </div>
                </div>

                {/* Textarea Input Field */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70">
                    Sua Anotação / Comentários
                  </label>
                  <textarea
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Como foi o desempenho neste período? Escreva um resumo rápido ou feedback..."
                    className={cn(
                      "w-full px-4 py-3 rounded-none border text-sm leading-relaxed focus:outline-none focus:ring-1 resize-none",
                      isDark 
                        ? "bg-[#25282b] border-white/10 text-white placeholder-white/30 focus:ring-white/20" 
                        : "bg-white border-[#dadce0] text-[#1f1f1f] placeholder-zinc-400 focus:ring-black/20"
                    )}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className={cn("p-6 border-t flex items-center justify-end gap-3", isDark ? "border-white/5 bg-[#17191b]" : "border-black/[0.04] bg-[#fcfcfc]")}>
                <button
                  type="button"
                  onClick={() => setFeedbackActivity(null)}
                  className={cn(
                    "px-5 py-2.5 text-xs font-bold rounded-none transition-all cursor-pointer border",
                    isDark ? "border-white/5 text-white/50 hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:bg-black/5"
                  )}
                >
                  Pular / Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveFeedback}
                  disabled={isSavingFeedback || feedbackRating === ''}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-none shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100",
                    isDark ? "text-[#062e6f]" : "hover:opacity-90"
                  )}
                  style={!(isSavingFeedback || feedbackRating === '') ? { backgroundColor: accentColor, color: getContrastColor(accentColor) } : {}}
                >
                  {isSavingFeedback ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Salvar Feedback</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showTrash && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrash(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-none shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-[#1f1f1f]"
            >
              <div className="px-8 py-6 border-b border-[#f1f3f4] flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-medium text-[#1f1f1f]">Lixeira</h2>
                  <p className="text-xs text-[#5f6368]">Arquivos removidos temporariamente</p>
                </div>
                <button 
                  onClick={() => setShowTrash(false)}
                  className="w-10 h-10 rounded-none flex items-center justify-center hover:bg-[#f1f3f4] transition-all"
                >
                  <X className="w-5 h-5 text-[#444746]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {trashedFiles.length === 0 ? (
                  <div className="py-20 text-center opacity-40">
                    <Trash2 className="w-16 h-16 mx-auto mb-4 text-[#dadce0]" />
                    <p className="text-sm font-medium">Lixeira vazia</p>
                  </div>
                ) : (
                  <>
                    {trashedFiles.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-[#f8f9fa] rounded-none group border border-transparent hover:border-[#dadce0] transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-none bg-white border border-[#dadce0] flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-[#5f6368]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#1f1f1f]">{file.name}</p>
                            <p className="text-[10px] text-[#5f6368]">Arquivo removido</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleRestoreFromTrash(file.id)}
                            className="px-4 py-2 text-xs font-bold hover:bg-black/5 rounded-none transition-all flex items-center gap-2"
                            style={{ color: accentColor }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </button>
                          <button 
                            onClick={() => handlePermanentDelete(file.id)}
                            className="p-2 text-[#5f6368] hover:text-red-500 hover:bg-red-50 rounded-none transition-all"
                            title="Excluir permanentemente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDrive && accessToken && (
          <DriveExplorer 
            accessToken={accessToken} 
            onSelect={handleDriveSelect} 
            onClose={() => setShowDrive(false)} 
            theme={currentThemeData}
            accentColor={accentColor}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showUploadsModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUploadsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-none shadow-2xl overflow-hidden flex flex-col max-h-[70vh]",
                isDark ? "bg-[#25282b] text-white" : "bg-white text-[#1f1f1f]"
              )}
            >
              <div className={cn("px-8 py-6 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-[#f1f3f4]")}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-none flex items-center justify-center" style={{ backgroundColor: `${accentColor}1A` }}>
                    <Upload className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium">Uploads de Agenda</h2>
                    <p className={cn("text-[10px] uppercase font-bold tracking-wider opacity-40")}>Gerenciar origens</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowUploadsModal(false)}
                  className={cn("w-8 h-8 rounded-none flex items-center justify-center transition-all", isDark ? "hover:bg-white/5" : "hover:bg-black/5")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Agendas</h3>
                  {selectedIndividualFiles.length > 0 ? (
                    <div className="space-y-2">
                       {selectedIndividualFiles.map(file => (
                        <div key={file.id} className={cn("flex items-center justify-between p-3 rounded-none group transition-all", isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/5 hover:bg-black/10")}>
                          <div className="flex items-center gap-3 overflow-hidden">
                            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                            <span className="text-xs font-medium truncate">{file.name}</span>
                          </div>
                          <button onClick={() => handleMoveToTrash(file.id, 'file')} className="p-1 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs opacity-30 italic">Nenhuma agenda selecionada</p>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-dashed border-current/10">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Google Agenda</h3>
                  <div className={cn("flex items-center justify-between p-3 rounded-none transition-all", isDark ? "bg-white/5" : "bg-black/5")}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold">Importar do Google Agenda</span>
                        <span className="text-[9px] opacity-50">Sincroniza eventos de hoje</span>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={importGoogleCalendar} 
                        onChange={(e) => {
                          setImportGoogleCalendar(e.target.checked);
                        }} 
                        className="sr-only peer" 
                      />
                      <div className={cn(
                        "w-8 h-4 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3.5 after:transition-all",
                        importGoogleCalendar && "peer-checked:bg-emerald-500"
                      )}
                      style={importGoogleCalendar ? { backgroundColor: accentColor } : {}}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className={cn("p-6 border-t flex flex-col gap-3", isDark ? "border-white/5" : "border-black/5")}>
                 <button
                  onClick={() => { handleSyncAgendas(undefined, true); setShowUploadsModal(false); }}
                  disabled={loading || isSyncing || (selectedIndividualFiles.length === 0 && !importGoogleCalendar)}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-30",
                    isDark ? "bg-[#a8c7fa] text-[#062e6f]" : "hover:opacity-90"
                  )}
                  style={!isDark && !(loading || isSyncing || (selectedIndividualFiles.length === 0 && !importGoogleCalendar)) ? { backgroundColor: accentColor, color: getContrastColor(accentColor) } : {}}
                >
                  {loading || isSyncing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>Sincronizar Agora</span>
                </button>

                 <button
                  onClick={() => { handleOpenExplorer(); setShowUploadsModal(false); }}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-full text-xs font-bold transition-all border shrink-0",
                    isDark ? "bg-white/5 border-white/5 text-white/60 hover:text-white" : "bg-white border-[#f1f3f4] text-[#2a2c30] hover:text-black font-semibold"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Conectar novas agendas</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVisualCalendar && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVisualCalendar(false)}
              className={cn("absolute inset-0 backdrop-blur-md", isDark ? "bg-black/60" : "bg-black/30")}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full h-full max-w-6xl md:h-[90vh] rounded-none md:rounded-none shadow-2xl overflow-hidden flex flex-col border bg-white border-zinc-200/80 text-black"
            >
              <div className="px-8 py-6 border-b border-[#f1f3f4] flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-none flex items-center justify-center shadow-lg animate-fade-in"
                    style={{ backgroundColor: accentColor, color: getContrastColor(accentColor), boxShadow: `0 10px 15px -3px ${accentColor}33` }}
                  >
                    <LayoutGrid className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-display tracking-tight text-neutral-900">Visualização de Rotina</h2>
                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-neutral-400">Cronograma Linear</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                   <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-none mr-4 bg-[#f8f9fa] border border-[#f1f3f4]">
                      <div className="flex items-center gap-2">
                         <span className="relative flex h-2 w-2">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-emerald-500 opacity-75 duration-1000" />
                           <span className="relative inline-flex rounded-none h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                         </span>
                         <span className="text-[10px] font-bold uppercase text-[#5f6368]">Tempo Real</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: accentColor }}>{currentTimeStr}</span>
                   </div>
                   <button 
                    onClick={() => setShowVisualCalendar(false)}
                    className="w-10 h-10 rounded-none flex items-center justify-center transition-all hover:bg-black/5 text-neutral-500"
                  >
                    <X className="w-5 h-5" />
                   </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <VisualCalendar 
                  schedule={schedule}
                  onSelectActivity={(item) => {
                    setSelectedActivityOverride(item);
                    setShowVisualCalendar(false);
                  }}
                  displayedActivity={displayedActivity}
                  isDark={false}
                  currentTimeStr={currentTimeStr}
                  accentColor={accentColor}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="h-14 flex items-center justify-between px-6 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
               "p-2 rounded-none transition-all hover:bg-black/5 dark:hover:bg-white/5",
              currentThemeData.colors.sub
            )}
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div 
            onClick={() => profileInputRef.current?.click()}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden cursor-pointer shadow-sm border border-black/5 hover:shadow-md transition-all active:scale-95 shrink-0"
            style={{ color: accentColor }}
          >
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" />
            )}
            <input type="file" ref={profileInputRef} onChange={handleProfileImageChange} className="hidden" accept="image/*" />
          </div>
          <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <h1 className={cn("text-xs font-bold tracking-tight", currentThemeData.colors.text)}>{currentUser?.displayName || "Brendow"}</h1>
                {/* Clickable Date Badge for Mobile (hidden on desktop) */}
                <div className="md:hidden relative flex items-center gap-1 px-1.5 py-0.5 rounded-none bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:opacity-85 transition-opacity" title="Clique para escolher outra data">
                  <Calendar className="w-2.5 h-2.5 opacity-60" style={{ color: accentColor }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                    {selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </span>
                  <input 
                    type="date" 
                    value={localDateStr} 
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        const newDate = new Date(y, m - 1, d, 12, 0, 0);
                        setSelectedDate(newDate);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>
              {currentUser && (
                <span className="text-[9px] opacity-50 font-sans tracking-wide">
                  {isDbSyncing ? "Sincronizando..." : "Sincronizado na Nuvem"}
                </span>
              )}
          </div>
          <input type="file" ref={bgInputRef} onChange={handleBgImageChange} className="hidden" accept="image/*" />
          <input type="file" ref={sidebarBgInputRef} onChange={handleSidebarBgImageChange} className="hidden" accept="image/*" />
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end mr-2">
            <ClockDisplay 
              time={currentTime} 
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              accentColor={accentColor} 
            />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowUploadsModal(true)}
              disabled={!accessToken}
              className={cn(
                "w-9 h-9 rounded-none flex items-center justify-center transition-all relative overflow-hidden",
                (loading || isSyncing) 
                  ? "" 
                  : cn(isDark ? "hover:bg-white/10" : "hover:bg-[#f1f3f4]", currentThemeData.colors.sub),
                !accessToken && "opacity-30"
              )}
              style={(loading || isSyncing) ? { backgroundColor: `${accentColor}10`, color: accentColor } : {}}
              title="Sincronizar Tudo"
            >
              <AnimatePresence mode="wait">
                {loading || isSyncing ? (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  >
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.div>
                )}
              </AnimatePresence>
              {(loading || isSyncing) && (
                <div className="absolute top-0.5 right-0.5 flex items-center justify-center">
                  {syncPercentage !== null ? (
                    <div 
                      className="text-[7px] font-black w-3.5 h-3.5 rounded-none flex items-center justify-center animate-pulse"
                      style={{ backgroundColor: accentColor, color: getContrastColor(accentColor) }}
                    >
                      {Math.min(100, Math.max(0, syncPercentage))}
                    </div>
                  ) : (
                    <div className="w-2 h-2 rounded-none animate-pulse" style={{ backgroundColor: accentColor }} />
                  )}
                </div>
              )}
            </button>

            <button
              onClick={() => {
                handleSignOut();
              }}
              className={cn(
                "w-9 h-9 rounded-none flex items-center justify-center transition-all text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              )}
              title="Sair da Conta / Desconectar"
            >
              <LogOut className="w-4 h-4" />
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  "w-9 h-9 rounded-none flex items-center justify-center transition-all",
                  showSettings 
                    ? "text-current" 
                    : cn(isDark ? "hover:bg-white/10" : "hover:bg-[#f1f3f4]", currentThemeData.colors.sub)
                )}
                style={showSettings ? { backgroundColor: `var(--accent-color-10)`, color: accentColor } : {}}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              <AnimatePresence>
                {showSettings && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className={cn(
                        "absolute right-0 mt-2 w-64 rounded-none shadow-xl border p-2 z-50",
                        isDark ? "bg-[#25282b] border-[#444746]" : "bg-white border-[#dadce0]"
                      )}
                    >
                      <div className={cn("px-3 py-2 text-[10px] font-bold uppercase tracking-wider", isDark ? "text-white/40" : "text-[#5f6368]")}>Temas</div>
                      <div className="space-y-0.5">
                        {themes.map(t => (
                          <button
                            key={t.id}
                            onClick={() => { 
                              setTheme(t.id as any); 
                              setAccentColor(t.colors.primary); 
                              setShowSettings(false); 
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs transition-all",
                              theme === t.id 
                                ? (isDark ? "bg-white/10 text-[#a8c7fa]" : "") 
                                : cn("hover:bg-black/5", currentThemeData.colors.sub)
                            )}
                            style={theme === t.id && !isDark ? { backgroundColor: `${accentColor}1A`, color: accentColor } : {}}
                          >
                            {t.icon}
                            <span className="flex-1 text-left font-medium">{t.name}</span>
                            {theme === t.id && <div className="w-1 h-1 bg-current rounded-none" />}
                          </button>
                        ))}
                      </div>
                      <div className={cn("h-[1px] my-2", isDark ? "bg-white/5" : "bg-[#dadce0]")} />
                      <button
                        onClick={() => { setShowTrash(true); setShowSettings(false); }}
                        className={cn(
                           "w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs transition-all",
                           isDark ? "hover:bg-white/5 text-white/70" : "hover:bg-black/5 text-[#444746]"
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="font-medium">Lixeira</span>
                      </button>
                      <button
                        onClick={() => { setShowUploadsModal(true); setShowSettings(false); }}
                        className={cn(
                           "w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs transition-all",
                           isDark ? "hover:bg-white/5 text-white/70" : "hover:bg-black/5 text-[#444746]"
                        )}
                      >
                        <Upload className="w-4 h-4" />
                        <span className="font-medium">Uploads de Agenda</span>
                      </button>
                      <button
                        onClick={() => {
                          handleSignOut();
                          setShowSettings(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all font-medium"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="font-medium">Sair da conta</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleExportToDocs}
              disabled={loading || exporting || !accessToken || schedule.length === 0}
              className={cn(
                "hidden lg:flex items-center gap-2 px-6 py-2 rounded-none text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-30",
                isDark ? "bg-[#3c4043] text-white hover:bg-[#4d5154]" : "bg-white border border-[#dadce0] hover:bg-[#f8f9fa]"
              )}
              style={{ color: !isDark && !loading && !exporting && accessToken && schedule.length > 0 ? accentColor : undefined }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Relatório</span>
            </button>
            <button
              onClick={handleOpenExplorer}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-full text-xs font-semibold transition-all shadow-sm active:scale-95",
                isDark ? "bg-[#a8c7fa] text-[#062e6f] hover:bg-[#b8d4ff]" : "hover:opacity-90"
              )}
              style={!isDark ? { backgroundColor: accentColor, color: getContrastColor(accentColor) } : {}}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Conectar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-2 relative">
        <aside 
          className={cn(
            "rounded-none flex flex-col flex-shrink-0 z-10 border transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] relative overflow-hidden",
            isDark ? "bg-[#1e1f20] border-[#3c4043]" : "bg-white border-[#f1f3f4]",
            sidebarCollapsed ? "w-16 opacity-100" : "w-80 opacity-100"
          )}
          style={{
            backgroundImage: sidebarBgImage ? `url(${sidebarBgImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {sidebarBgImage && (
            <div className={cn("absolute inset-0 z-0", isDark ? "bg-black/60" : "bg-white/60 backdrop-blur-sm")} />
          )}
          <div className="relative z-10 flex flex-col h-full">
            <div className={cn("p-6 pb-2 transition-opacity flex items-center justify-between", sidebarCollapsed ? "justify-center px-2" : "px-6")}>
              {!sidebarCollapsed && (
                <h2 className={cn("text-[11px] font-bold uppercase tracking-[0.2em] opacity-40 whitespace-nowrap", currentThemeData.colors.text)}>Sistema</h2>
              )}
            </div>
            
            <div className={cn("flex-1 overflow-y-auto custom-scrollbar space-y-2 pb-6 transition-all", sidebarCollapsed ? "px-2" : "px-4")}>
              {/* Sidebar content logic - if collapsed show icons only */}
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-6 pt-4">
                    <button onClick={() => setShowIndividualFilesSection(true)} title="Agendas">
                        <Calendar className="w-5 h-5 opacity-40 hover:opacity-100 transition-opacity" style={{ color: accentColor }} />
                    </button>
                    <div className="w-8 h-[1px] bg-current opacity-10" />
                    <button onClick={() => setSidebarCollapsed(false)} title="Ver Agenda">
                        <Clock className="w-5 h-5 opacity-40 hover:opacity-100 transition-opacity" style={{ color: accentColor }} />
                    </button>
                </div>
              ) : (
                <>
              <div className="h-2" />
              <div className="flex items-center gap-2.5 px-3 pb-1.5 select-none">
                {isToday ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-emerald-500 opacity-75 duration-1000" />
                      <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    </span>
                    <h2 className={cn("text-[11.5px] font-extrabold uppercase tracking-[0.2em]", currentThemeData.colors.text)}>
                      Agora
                    </h2>
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5 opacity-70 animate-pulse" style={{ color: accentColor }} />
                    <h2 className={cn("text-[11.5px] font-extrabold uppercase tracking-[0.2em]", currentThemeData.colors.text)}>
                      Visualizando {selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                    </h2>
                  </>
                )}
              </div>

              {loading && schedule.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="relative w-20 h-20 flex items-center justify-center mb-5">
                    {/* Outer breathing background */}
                    <div
                      className="absolute inset-0 rounded-none blur-md opacity-25 animate-pulse"
                      style={{ backgroundColor: accentColor }}
                    />

                    {/* Rotating dashed ring */}
                    <motion.div
                      className="absolute inset-0 rounded-none border border-dashed opacity-40 text-current"
                      style={{ borderColor: accentColor }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    />

                    {/* Fast solid accent ring */}
                    <motion.div
                      className="absolute inset-1 rounded-none border border-transparent"
                      style={{ borderTopColor: accentColor }}
                      animate={{ rotate: -360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                    />

                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold font-mono" style={{ color: currentThemeData.colors.primary }}>
                        {syncPercentage !== null ? `${Math.min(100, Math.max(0, syncPercentage))}%` : '0%'}
                      </span>
                    </div>
                  </div>
                  <h3 className={cn("text-sm font-bold tracking-tight mb-1", currentThemeData.colors.text)}>
                    Sincronizando agendas
                  </h3>
                  <p className={cn("text-[10px] uppercase font-bold tracking-widest opacity-40", currentThemeData.colors.text)}>
                    Aguarde
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {!isToday && (
                    <div className="px-1 mb-2">
                      <button
                        onClick={() => setSelectedDate(new Date())}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold border transition-all hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer active:scale-95",
                          isDark ? "border-white/10 text-white/70" : "border-[#dadce0] text-zinc-600"
                        )}
                        style={{ borderColor: `${accentColor}33` }}
                      >
                        <RotateCcw className="w-3.5 h-3.5 animate-spin-reverse" style={{ color: accentColor }} />
                        Voltar para Hoje
                      </button>
                    </div>
                  )}

                  {/* Current Active Activity */}
                  {isToday ? (
                    currentActivities.length > 0 ? (
                      <div className="space-y-2 px-1">
                        {currentActivities.map((activity, idx) => (
                          <TimelineItem
                            key={`current-${idx}`}
                            item={activity}
                            idx={idx}
                            isActive={displayedActivity === activity}
                            isPast={false}
                            isCurrent={true}
                            currentTimeStr={currentTimeStr}
                            onClick={() => setSelectedActivityOverride(activity)}
                            getDuration={getDuration}
                            theme={currentThemeData}
                            accentColor={accentColor}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={cn("p-4 rounded-none border border-dashed text-center mx-1", isDark ? "border-white/10 bg-white/5" : "border-[#dadce0] bg-[#f8f9fa]")}>
                        <p className="text-[11px] font-medium opacity-50">Nenhuma atividade no momento</p>
                      </div>
                    )
                  ) : (
                    <div className={cn("p-4 rounded-none border border-dashed text-center mx-1", isDark ? "border-white/10 bg-white/5" : "border-[#dadce0] bg-[#f8f9fa]")}>
                      <p className="text-[11px] font-medium opacity-50">Visualizando dia {selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</p>
                    </div>
                  )}

                  {/* Drag Grip Handle - Only Three Dots */}
                  <DragAccordionHandle
                    isOpen={showFullTimeline || !isToday}
                    onToggle={(isOpen) => {
                      if (isToday) {
                        setShowFullTimeline(isOpen);
                        localStorage.setItem('showFullTimeline', String(isOpen));
                      }
                    }}
                    isDark={isDark}
                    accentColor={accentColor}
                  />

                  {/* Everything Below - Hide/Show Totally */}
                  <AnimatePresence initial={false}>
                    {(showFullTimeline || !isToday) && schedule.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: "easeInOut" }}
                        className="overflow-hidden space-y-6 pt-1"
                      >
                        {/* 1. Cronograma Completo Section */}
                        <div className="space-y-3 px-1 flex flex-col">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-60">
                              Cronograma Completo
                            </span>
                            <button
                              onClick={() => setShowVisualCalendar(!showVisualCalendar)}
                              className={cn(
                                "w-7 h-7 rounded-none flex items-center justify-center transition-all border shrink-0",
                                showVisualCalendar
                                  ? ""
                                  : (isDark ? "bg-white/5 border-white/5 hover:bg-white/10" : "bg-white border-[#f1f3f4] hover:bg-black/5"),
                                currentThemeData.colors.sub
                              )}
                              style={showVisualCalendar ? { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}4D`, color: accentColor } : {}}
                              title={showVisualCalendar ? "Ver em lista" : "Ver visualmente"}
                            >
                              {showVisualCalendar ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <div className="space-y-2 pr-1">
                            {schedule.map((item, idx) => {
                              const isCurrentlyActive = currentActivities.some(a => a === item);
                              const isPast = item.endTime < currentTimeStr;

                              return (
                                <TimelineItem
                                  key={`${item.startTime}-${item.activity}-${idx}`}
                                  item={item}
                                  idx={idx}
                                  isActive={item === displayedActivity}
                                  isPast={isPast}
                                  isCurrent={isCurrentlyActive}
                                  currentTimeStr={currentTimeStr}
                                  onClick={() => setSelectedActivityOverride(item)}
                                  getDuration={getDuration}
                                  theme={currentThemeData}
                                  accentColor={accentColor}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            
          </>
        )}
      </div>

      {/* Connected Agendas (Files) Section - Moved to the bottom base of the left sidebar */}
      {!sidebarCollapsed && (
        <div className={cn(
          "p-4 border-t transition-all shrink-0 bg-[#fbfcfd]/20 backdrop-blur-md",
          isDark ? "border-white/5 bg-[#141517]/40" : "border-black/[0.03]"
        )}>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className={cn("text-[9.5px] font-extrabold uppercase tracking-widest opacity-55", currentThemeData.colors.text)}>
              Agendas Conectadas ({selectedIndividualFiles.length + (importGoogleCalendar ? 1 : 0)})
            </span>
          </div>
          
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
            {/* Google Agenda Connection Item */}
            <div 
              className={cn(
                "flex items-center justify-between p-2 rounded-none transition-all group border border-transparent cursor-pointer",
                importGoogleCalendar 
                  ? (isDark ? "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10" : "bg-emerald-50/50 border-emerald-200/50 hover:bg-emerald-100/30")
                  : (isDark ? "hover:bg-white/[0.03] hover:border-white/5 opacity-50 hover:opacity-100" : "hover:bg-black/[0.02] hover:border-black/[0.02] opacity-50 hover:opacity-100")
              )}
              onClick={() => setImportGoogleCalendar(!importGoogleCalendar)}
              title={importGoogleCalendar ? "Clique para desativar a importação da Google Agenda" : "Clique para ativar a importação da Google Agenda"}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn("w-1.5 h-1.5 rounded-none shrink-0", importGoogleCalendar ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                <span className={cn("text-[11px] font-bold truncate transition-colors", 
                  importGoogleCalendar 
                    ? (isDark ? "text-emerald-400" : "text-emerald-600") 
                    : (isDark ? "text-white/60" : "text-zinc-600")
                )}>
                  Google Agenda ({importGoogleCalendar ? "Ativa" : "Inativa"})
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 text-[9px] font-bold uppercase tracking-wider px-1">
                {importGoogleCalendar ? "Desligar" : "Ligar"}
              </div>
            </div>

            {selectedIndividualFiles.length > 0 && (
              selectedIndividualFiles.map(file => (
                <div 
                  key={file.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-none transition-all group border border-transparent",
                    isDark 
                      ? "hover:bg-white/[0.03] hover:border-white/5" 
                      : "hover:bg-black/[0.02] hover:border-black/[0.02]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-1.5 h-1.5 rounded-none shrink-0" style={{ backgroundColor: accentColor }} />
                    <span className={cn("text-[11px] font-semibold truncate transition-colors", isDark ? "text-white/70 group-hover:text-white" : "text-zinc-600 group-hover:text-zinc-800")}>
                      {file.name}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleMoveToTrash(file.id)} 
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-500/50 hover:text-red-500 transition-all cursor-pointer rounded-none hover:bg-red-50 dark:hover:bg-red-950/20"
                    title="Mover para a lixeira"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}

            {selectedIndividualFiles.length === 0 && !importGoogleCalendar && (
              <div className="flex flex-col items-center justify-center py-3 px-2 text-center rounded-none bg-black/[0.01] dark:bg-white/[0.01]">
                <p className="text-[10px] italic opacity-35">Nenhuma agenda ativa</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </aside>

        <section className={cn(
          "flex-1 rounded-none overflow-hidden flex flex-col relative border transition-colors",
          theme === 'dark' || theme === 'oled' ? "bg-[#1f2123] border-[#444746]" : "bg-white border-[#e1e3e1]"
        )}>
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-6 left-1/2 -translate-x-1/2 p-3 bg-[#fce8e6] text-[#b3261e] rounded-none flex items-center gap-3 shadow-sm z-30 border border-[#f9dad9] max-w-md w-auto"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <span className="text-xs font-medium">{error}</span>
                  {(error.includes('Sessão expirada') || error.includes('autentique-se') || error.includes('autenticação')) && (
                    <button
                      onClick={handleReauthenticate}
                      className="px-2.5 py-1 bg-[#b3261e] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#8c1d18] transition-colors cursor-pointer self-start sm:self-auto rounded-none shadow-sm flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Entrar com Google
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8">
            <AnimatePresence mode="wait">
              <ProtocolView 
                loading={loading}
                syncPercentage={syncPercentage}
                schedule={schedule}
                displayedActivity={displayedActivity}
                isCurrentActivity={currentActivities.some(a => a === displayedActivity)}
                selectedActivityOverride={selectedActivityOverride}
                onResetOverride={() => setSelectedActivityOverride(null)}
                getDuration={getDuration}
                currentTimeStr={currentTimeStr}
                theme={currentThemeData}
                accentColor={accentColor}
                customizations={activityCustomizations}
                onUpdateCustomization={(data) => {
                  if (!displayedActivity) return;
                  const key = `${displayedActivity.activity}-${displayedActivity.startTime}-${displayedActivity.endTime}`;
                  setActivityCustomizations(prev => ({
                    ...prev,
                    [key]: data
                  }));
                }}
                onSelectActivity={(activity) => setSelectedActivityOverride(activity)}
                onUpdateActivityTime={handleUpdateActivityTime}
                onTriggerFeedback={(activity) => {
                  setFeedbackActivity(activity);
                  setFeedbackText('');
                  setFeedbackRating('');
                }}
              />
            </AnimatePresence>
          </div>
        </section>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #bdc1c6; }
      `}</style>
      </div>
    </div>
  );
}
