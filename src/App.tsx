/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  OAuthProvider,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  Timestamp, 
  serverTimestamp, 
  addDoc,
  updateDoc,
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
  OperationType,
  handleFirestoreError,
  User
} from './firebase';
import { initializeApp, getApp } from 'firebase/app';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import { 
  LogOut, 
  LogIn, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  Users, 
  BarChart3, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Clock,
  ArrowRightLeft,
  Eye,
  EyeOff,
  UserPlus,
  Ban,
  Camera,
  Upload,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, subDays, isBefore, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

export type UserRole = 'admin' | 'superviseur' | 'personnel' | 'stagiaire' | 'ouvrier';

interface UserProfile {
  uid: string;
  email?: string;
  username?: string;
  password?: string;
  displayName: string;
  role: UserRole;
  roles?: UserRole[];
  dailyRate?: number; // Pour les ouvriers
  suspended?: boolean;
  createdAt?: Timestamp;
  photoURL?: string;
  lastUpdatedBy?: string;
  lastUpdatedByName?: string;
  lastUpdatedAt?: Timestamp;
}

const getPrimaryRole = (profile: UserProfile | null): UserRole => {
  if (!profile) return 'personnel';
  if (profile.roles && profile.roles.length > 0) return profile.roles[0];
  return profile.role;
};

const hasRole = (profile: UserProfile | null, role: UserRole): boolean => {
  if (!profile) return false;
  if (profile.roles) return profile.roles.includes(role);
  return profile.role === role;
};

const isAdmin = (profile: UserProfile | null) => hasRole(profile, 'admin');
const isSuper = (profile: UserProfile | null) => hasRole(profile, 'superviseur');
const isAdminOrSuper = (profile: UserProfile | null) => isAdmin(profile) || isSuper(profile);

const ROLE_COLORS: Record<UserRole, { 
  primary: string, 
  bg: string, 
  text: string, 
  ring: string, 
  border: string,
  bgPrimary: string,
  textPrimary: string,
  shadow: string
}> = {
  admin: { 
    primary: 'emerald-600', 
    bg: 'bg-emerald-50', 
    text: 'text-emerald-700', 
    ring: 'ring-emerald-100', 
    border: 'border-emerald-200',
    bgPrimary: 'bg-emerald-600',
    textPrimary: 'text-emerald-600',
    shadow: 'shadow-emerald-600/20'
  },
  superviseur: { 
    primary: 'purple-600', 
    bg: 'bg-purple-50', 
    text: 'text-purple-700', 
    ring: 'ring-purple-100', 
    border: 'border-purple-200',
    bgPrimary: 'bg-purple-600',
    textPrimary: 'text-purple-600',
    shadow: 'shadow-purple-600/20'
  },
  personnel: { 
    primary: 'blue-600', 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    ring: 'ring-blue-100', 
    border: 'border-blue-200',
    bgPrimary: 'bg-blue-600',
    textPrimary: 'text-blue-600',
    shadow: 'shadow-blue-600/20'
  },
  stagiaire: { 
    primary: 'teal-600', 
    bg: 'bg-teal-50', 
    text: 'text-teal-700', 
    ring: 'ring-teal-100', 
    border: 'border-teal-200',
    bgPrimary: 'bg-teal-600',
    textPrimary: 'text-teal-600',
    shadow: 'shadow-teal-600/20'
  },
  ouvrier: { 
    primary: 'orange-600', 
    bg: 'bg-orange-50', 
    text: 'text-orange-700', 
    ring: 'ring-orange-100', 
    border: 'border-orange-200',
    bgPrimary: 'bg-orange-600',
    textPrimary: 'text-orange-600',
    shadow: 'shadow-orange-600/20'
  }
};

const STATUS_COLORS = {
  present: { 
    primary: 'green-600', 
    bg: 'bg-green-50', 
    text: 'text-green-700', 
    ring: 'ring-green-100', 
    border: 'border-green-200',
    bgPrimary: 'bg-green-600'
  },
  absent: { 
    primary: 'red-600', 
    bg: 'bg-red-50', 
    text: 'text-red-700', 
    ring: 'ring-red-100', 
    border: 'border-red-200',
    bgPrimary: 'bg-red-600'
  },
  none: { 
    primary: 'slate-400', 
    bg: 'bg-slate-50', 
    text: 'text-slate-600', 
    ring: 'ring-slate-100', 
    border: 'border-slate-200',
    bgPrimary: 'bg-slate-400'
  }
};

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent';
  markedBy: string;
  markedByName?: string;
  checkIn?: Timestamp;
  checkOut?: Timestamp;
  timestamp: Timestamp;
  updatedBy?: string;
  updatedByName?: string;
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error?.message || 'An unexpected error occurred');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Une erreur est survenue</h2>
          <p className="text-gray-600 mb-6">{error || 'Une erreur inattendue s\'est produite'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Recharger l'application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center"
    >
      <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
      <p className="text-slate-600 font-medium">Chargement du suivi de présence...</p>
    </motion.div>
  </div>
);

const AdminStatsGrid = ({ title, records, periodLabel, totalUsers, date, color }: { title: string, records: AttendanceRecord[], periodLabel: string, totalUsers: number, date: Date, color?: any }) => {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayRecords = records.filter(r => r.date === dateStr);
  const presentCount = dayRecords.filter(r => r.status === 'present').length;
  
  // Statistics for the selected day
  const totalExpected = totalUsers;
  const absentCount = Math.max(0, totalExpected - presentCount);
  const rate = totalExpected > 0 ? Math.round((presentCount / totalExpected) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          <BarChart3 className={cn("w-4 h-4", color ? color.textPrimary : "text-emerald-600")} />
          {title}
        </h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{periodLabel}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-slate-600 text-sm font-medium">Présences</span>
          </div>
          <span className="text-xl font-bold text-green-600">{presentCount}</span>
        </div>
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-slate-600 text-sm font-medium">Absences</span>
          </div>
          <span className="text-xl font-bold text-red-600">{absentCount}</span>
        </div>
        <div className={cn("flex items-center justify-between p-4 rounded-2xl shadow-md", color ? `${color.bgPrimary} ${color.shadow}` : "bg-emerald-600 shadow-emerald-600/20")}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-white/80 text-sm font-medium">Taux</span>
          </div>
          <span className="text-xl font-bold text-white">{rate}%</span>
        </div>
      </div>
    </div>
  );
};

const StatsCard = ({ title, records, periodLabel, color }: { title: string, records: AttendanceRecord[], periodLabel: string, color?: any }) => {
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const totalRecords = records.length;
  
  const rate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

  return (
    <div className={cn("bg-white p-6 rounded-3xl shadow-sm border", color ? color.border : "border-slate-200")}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BarChart3 className={cn("w-5 h-5", color ? color.textPrimary : "text-emerald-600")} />
          {title}
        </h2>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{periodLabel}</div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border border-green-100">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-green-700 font-medium">Présent</span>
          </div>
          <span className="text-xl font-bold text-green-700">{presentCount}</span>
        </div>
        <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700 font-medium">Absent</span>
          </div>
          <span className="text-xl font-bold text-red-700">{absentCount}</span>
        </div>
        <div className={cn("pt-4 border-t text-center", color ? color.border : "border-slate-100")}>
          <div className={cn("text-3xl font-black", color ? color.textPrimary : "text-emerald-600")}>{rate}%</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Taux de présence</div>
        </div>
      </div>
    </div>
  );
};

const ProfileModal = ({ 
  isOpen, 
  onClose, 
  profile, 
  user,
  themeColor 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  profile: UserProfile | null, 
  user: User | null,
  themeColor: any 
}) => {
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || user?.photoURL || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setPhotoURL(profile.photoURL || user?.photoURL || '');
    }
  }, [profile, user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setError("Veuillez sélectionner une image valide.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("L'image est trop volumineuse (max 2Mo).");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setPhotoURL(downloadURL);
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError("Erreur lors de l'importation de l'image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    
    if (!displayName.trim()) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // Update Auth Profile
      try {
        await updateProfile(user, {
          displayName: displayName,
          photoURL: photoURL
        });
      } catch (authErr: any) {
        console.error('Error updating Auth profile:', authErr);
      }
      
      // Update Firestore Profile
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: displayName,
          photoURL: photoURL,
          lastUpdatedAt: Timestamp.now(),
          lastUpdatedBy: user.uid,
          lastUpdatedByName: displayName
        });
      } catch (fsErr: any) {
        handleFirestoreError(fsErr, OperationType.UPDATE, `users/${user.uid}`, user);
      }
      
      onClose();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      if (err.message && err.message.includes('{')) {
        // This is likely a JSON error from handleFirestoreError
        setError("Erreur de permission ou de données. Veuillez vérifier vos informations.");
      } else {
        setError("Une erreur est survenue lors de la mise à jour du profil.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className={cn("p-8 text-center relative", themeColor.bg)}>
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 hover:bg-white/50 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
              
              <div className="relative inline-block mb-4 group">
                <img 
                  src={photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
                  alt="Avatar" 
                  className={cn("w-24 h-24 rounded-full border-4 shadow-lg object-cover", themeColor.border)}
                  referrerPolicy="no-referrer"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={cn(
                    "absolute -bottom-1 -right-1 p-2 rounded-full shadow-md transition-all hover:scale-110 active:scale-95",
                    `${themeColor.bgPrimary} text-white`,
                    isUploading && "animate-pulse opacity-70"
                  )}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*"
                />
              </div>
              
              <h2 className="text-2xl font-black text-slate-800">Mon Profil</h2>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {profile && (profile.roles || [profile.role]).map(r => (
                  <span key={r} className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    ROLE_COLORS[r].bg, ROLE_COLORS[r].text
                  )}>
                    {r}
                  </span>
                ))}
              </div>
              <p className="text-slate-500 text-sm mt-1">Personnalisez votre identité sur la plateforme</p>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-2xl border border-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nom d'affichage</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all bg-slate-50/50"
                  placeholder="Votre nom"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Photo de profil</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    value={photoURL}
                    onChange={(e) => setPhotoURL(e.target.value)}
                    className="flex-1 px-5 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all bg-slate-50/50"
                    placeholder="https://exemple.com/photo.jpg"
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors flex items-center justify-center"
                    title="Importer une image"
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Importez une image ou collez un lien. Laissez vide pour un avatar automatique.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className={cn(
                    "flex-[2] py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                    `${themeColor.bgPrimary} ${themeColor.shadow}`,
                    isSaving && "opacity-70 cursor-not-allowed"
                  )}
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const UserDetailModal = ({ 
  isOpen, 
  onClose, 
  userProfile, 
  attendanceRecords,
  workerStats,
  currentProfile,
  onUpdateUser
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userProfile: UserProfile | null, 
  attendanceRecords: AttendanceRecord[],
  workerStats: Record<string, { presentDays: number, totalPay: number }> | null,
  currentProfile: UserProfile | null,
  onUpdateUser: (uid: string, data: Partial<UserProfile>) => Promise<void>
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRoles, setEditRoles] = useState<UserRole[]>([]);
  const [editDailyRate, setEditDailyRate] = useState<number>(0);
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userProfile) {
      setEditName(userProfile.displayName);
      setEditRoles(userProfile.roles || [userProfile.role]);
      setEditDailyRate(userProfile.dailyRate || 0);
      setEditPhotoURL(userProfile.photoURL || '');
      setIsEditing(false);
    }
  }, [userProfile]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile) return;

    if (!file.type.startsWith('image/')) {
      setError("Image invalide.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image trop lourde (max 2Mo).");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const storageRef = ref(storage, `avatars/${userProfile.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setEditPhotoURL(downloadURL);
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError("Erreur d'importation.");
    } finally {
      setIsUploading(false);
    }
  };

  const userRecords = useMemo(() => {
    if (!userProfile) return [];
    return attendanceRecords
      .filter(r => r.userId === userProfile.uid)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, userProfile]);

  const primaryRole = editRoles[0] || userProfile?.role || 'personnel';
  const uColor = ROLE_COLORS[primaryRole as UserRole] || ROLE_COLORS.personnel;
  const stats = userProfile ? workerStats?.[userProfile.uid] : null;

  // Permissions check
  const canEdit = () => {
    if (!currentProfile || !userProfile) return false;
    if (isAdmin(currentProfile)) return true;
    if (isSuper(currentProfile)) {
      // Supervisor cannot edit admin or other supervisors
      return !isAdmin(userProfile) && !isSuper(userProfile);
    }
    return false;
  };

  const handleToggleRole = (role: UserRole) => {
    if (editRoles.includes(role)) {
      if (editRoles.length > 1) {
        setEditRoles(editRoles.filter(r => r !== role));
      }
    } else {
      if (editRoles.length < 2) {
        setEditRoles([...editRoles, role]);
      } else {
        setEditRoles([editRoles[0], role]);
      }
    }
  };

  const handleSave = async () => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      await onUpdateUser(userProfile.uid, {
        displayName: editName,
        roles: editRoles,
        role: editRoles[0],
        dailyRate: editDailyRate,
        photoURL: editPhotoURL
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating user:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && userProfile && currentProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className={cn("p-6 border-b flex items-center justify-between text-white", uColor.bgPrimary)}>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <img 
                    src={editPhotoURL || userProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`} 
                    alt={userProfile.displayName} 
                    className="w-12 h-12 rounded-2xl bg-white/20 object-cover"
                  />
                  {isEditing && (
                    <>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                      </button>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/*"
                      />
                    </>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <div className="space-y-1">
                      <input 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-white/20 border-none rounded px-2 py-1 text-white font-bold text-xl outline-none focus:ring-2 focus:ring-white/50"
                      />
                      {error && <p className="text-[10px] text-red-200 font-bold">{error}</p>}
                    </div>
                  ) : (
                    <h3 className="font-bold text-xl">{userProfile.displayName}</h3>
                  )}
                  <p className="text-white/80 text-sm">
                    {userProfile.email || 'Sans email'} • 
                    <span className="capitalize ml-1">
                      {editRoles.join(' & ')}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit() && (
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                    title={isEditing ? "Annuler" : "Modifier"}
                  >
                    {isEditing ? <XCircle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-6">
              {isEditing ? (
                <div className="space-y-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fonctions (Max 2)</label>
                    <div className="flex flex-wrap gap-2">
                      {(['admin', 'superviseur', 'personnel', 'stagiaire', 'ouvrier'] as UserRole[]).map(r => (
                        <button
                          key={r}
                          onClick={() => handleToggleRole(r)}
                          disabled={r === 'admin' && !isAdmin(currentProfile)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            editRoles.includes(r) 
                              ? `${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text} ring-2 ${ROLE_COLORS[r].ring}`
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editRoles.includes('ouvrier') && (
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Taux Journalier (FCFA)</label>
                      <input 
                        type="number"
                        value={editDailyRate}
                        onChange={(e) => setEditDailyRate(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                      />
                    </div>
                  )}

                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Enregistrer les modifications
                  </button>
                </div>
              ) : (
                <>
                  {userProfile.role === 'ouvrier' && stats && (
                    <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center">
                          <BarChart3 className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salaire Total Cumulé</div>
                          <div className="text-2xl font-black text-orange-600">{stats.totalPay.toLocaleString()} FCFA</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Jours Présents</div>
                        <div className="text-xl font-bold text-slate-700">{stats.presentDays} jours</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Historique des 7 derniers jours</h4>
                    <div className="space-y-3">
                      {eachDayOfInterval({
                        start: subDays(new Date(), 6),
                        end: new Date()
                      }).reverse().map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const record = attendanceRecords.find(r => r.userId === userProfile.uid && r.date === dateStr);
                        
                        return (
                          <div key={dateStr} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                record?.status === 'present' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                              )}>
                                {record?.status === 'present' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="font-bold text-slate-700 capitalize text-sm">
                                  {format(day, 'EEEE d MMMM yyyy', { locale: fr })}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record?.checkIn ? format(record.checkIn.toDate(), 'HH:mm') : '--:--'}</span>
                                  <ArrowRightLeft className="w-2 h-2" />
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record?.checkOut ? format(record.checkOut.toDate(), 'HH:mm') : '--:--'}</span>
                                </div>
                                {record?.updatedByName && (
                                  <div className="text-[8px] text-slate-400 italic mt-0.5 flex items-center gap-1">
                                    <ShieldCheck className="w-2 h-2" />
                                    Modifié par {record.updatedByName} le {format(record.timestamp.toDate(), 'dd/MM HH:mm')}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              record?.status === 'present' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {record?.status === 'present' ? 'Présent' : 'Absent'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white">
              <button 
                onClick={onClose}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
              >
                Fermer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const CreateUserModal = ({ 
  isOpen, 
  onClose, 
  onCreated,
  currentProfile
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onCreated: (data: any) => Promise<void>,
  currentProfile: UserProfile | null
}) => {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<UserRole[]>(['personnel']);
  const [dailyRate, setDailyRate] = useState<number>(0);
  const [photoURL, setPhotoURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError("Veuillez sélectionner une image valide.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("L'image est trop volumineuse (max 2Mo).");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const storageRef = ref(storage, `avatars/new_users/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setPhotoURL(downloadURL);
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError("Erreur lors de l'importation de l'image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleRole = (role: UserRole) => {
    if (roles.includes(role)) {
      if (roles.length > 1) {
        setRoles(roles.filter(r => r !== role));
      }
    } else {
      if (roles.length < 2) {
        setRoles([...roles, role]);
      } else {
        setRoles([roles[0], role]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password || !displayName) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    try {
      await onCreated({
        displayName,
        username: cleanUsername,
        password,
        roles,
        role: roles[0],
        dailyRate,
        photoURL
      });
      onClose();
      // Reset form
      setDisplayName('');
      setUsername('');
      setPassword('');
      setRoles(['personnel']);
      setDailyRate(0);
      setPhotoURL('');
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création du compte.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className="p-8 bg-emerald-600 text-white text-center relative">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black">Nouveau Compte</h2>
              <p className="text-emerald-100 text-sm">Créez un accès pour un collaborateur</p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-2xl border border-red-100">
                  {error}
                </div>
              )}

              <div className="flex justify-center mb-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {photoURL ? (
                      <img src={photoURL} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute -bottom-2 -right-2 p-2 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="image/*"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nom Complet</label>
                <input 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all bg-slate-50/50"
                  placeholder="Jean Dupont"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identifiant</label>
                <input 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all bg-slate-50/50"
                  placeholder="jdupont"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mot de Passe</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all bg-slate-50/50"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fonctions (Max 2)</label>
                <div className="flex flex-wrap gap-2">
                  {(['admin', 'superviseur', 'personnel', 'stagiaire', 'ouvrier'] as UserRole[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleToggleRole(r)}
                      disabled={r === 'admin' && !isAdmin(currentProfile)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        roles.includes(r) 
                          ? `${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text} ring-2 ${ROLE_COLORS[r].ring}`
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {roles.includes('ouvrier') && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Taux Journalier (FCFA)</label>
                  <input 
                    type="number"
                    value={dailyRate}
                    onChange={(e) => setDailyRate(parseInt(e.target.value) || 0)}
                    className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-orange-500 transition-all bg-slate-50/50"
                  />
                </div>
              )}

              <button 
                type="submit"
                disabled={isSaving}
                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 mt-4"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                Créer le compte
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const LoginScreen = () => {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'google' | 'manual' | 'register'>('google');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (provider: 'google') => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError('La fenêtre de connexion a été fermée avant la fin.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError(`ERREUR : La connexion Google n'est pas activée ou est mal configurée dans la console Firebase.`);
      } else {
        setLoginError('Une erreur est survenue lors de la connexion.');
        console.error('Login failed:', error);
      }
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const email = `${cleanUsername}@attendance.app`;
      console.log(`Attempting login for: ${email}`);
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      console.error('Login error details:', error.code, error.message);
      
      if (error.code === 'auth/operation-not-allowed') {
        setLoginError('ERREUR : La méthode de connexion par "Email/Password" n\'est pas activée dans la console Firebase. Veuillez l\'activer pour utiliser la connexion par identifiants.');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError('Nom d\'utilisateur ou mot de passe incorrect.');
      } else if (error.code === 'auth/invalid-email') {
        setLoginError('Format du nom d\'utilisateur invalide (ne doit pas contenir d\'espaces).');
      } else {
        setLoginError(`Erreur lors de la connexion: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password || !displayName) {
      setLoginError('Veuillez remplir tous les champs.');
      return;
    }
    
    if (cleanUsername.includes(' ')) {
      setLoginError('Le nom d\'utilisateur ne doit pas contenir d\'espaces.');
      return;
    }

    if (password.length < 6) {
      setLoginError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const email = `${cleanUsername}@attendance.app`;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const userDoc: UserProfile = {
        uid: uid,
        displayName: displayName,
        role: 'personnel',
        username: cleanUsername,
        suspended: false,
        createdAt: Timestamp.now()
      };
      
      await setDoc(doc(db, 'users', uid), userDoc);
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        setLoginError('Ce nom d\'utilisateur est déjà utilisé.');
      } else if (error.code === 'auth/weak-password') {
        setLoginError('Le mot de passe est trop court.');
      } else if (error.code === 'auth/invalid-email') {
        setLoginError('Format du nom d\'utilisateur invalide.');
      } else {
        setLoginError(`Erreur lors de l'inscription: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl shadow-emerald-100 border border-slate-100 text-center"
      >
        <div className="w-20 h-20 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
          <CalendarIcon className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Suivi de Présence</h1>
        <p className="text-slate-500 mb-8">Connectez-vous pour gérer ou consulter vos relevés de présence.</p>
        
        {loginError && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm font-medium rounded-2xl border border-red-100">
            {loginError}
          </div>
        )}

        <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
          <button 
            onClick={() => setLoginType('google')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              loginType === 'google' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Google
          </button>
          <button 
            onClick={() => setLoginType('manual')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              loginType === 'manual' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Connexion
          </button>
          <button 
            onClick={() => setLoginType('register')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              loginType === 'register' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            S'inscrire
          </button>
        </div>

        {loginType === 'google' ? (
          <div className="space-y-3">
            <button 
              onClick={() => handleLogin('google')}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98]"
            >
              <LogIn className="w-5 h-5" />
              Se connecter avec Google
            </button>
          </div>
        ) : loginType === 'manual' ? (
          <form onSubmit={handleManualLogin} className="space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">Nom d'utilisateur</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="Votre nom d'utilisateur"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">Mot de passe</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all pr-12"
                  placeholder="Votre mot de passe"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98] disabled:bg-slate-300"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Se connecter
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">Nom complet</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">Nom d'utilisateur (sans espaces)</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jdupont"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">Mot de passe (min. 6 car.)</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all pr-12"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98] disabled:bg-slate-300"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              Créer mon compte
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUserForConsult, setSelectedUserForConsult] = useState<UserProfile | null>(null);
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [editingTime, setEditingTime] = useState<{ userId: string, type: 'checkIn' | 'checkOut' } | null>(null);
  const [tempTime, setTempTime] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Listen to the user's profile in real-time
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubProfile = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const profileData = userDoc.data() as UserProfile;
            if (profileData.suspended) {
              await signOut(auth);
              alert("Votre compte a été suspendu. Veuillez contacter l'administrateur.");
              setLoading(false);
              return;
            }
            setProfile({ uid: userDoc.id, ...profileData });
          } else {
            // Create default profile if it doesn't exist
            const isDefaultAdmin = currentUser.email === 'daniel.shofela01@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Anonyme',
              role: isDefaultAdmin ? 'admin' : 'personnel',
              suspended: false,
              createdAt: Timestamp.now(),
              photoURL: currentUser.photoURL || ''
            };
            try {
              await setDoc(doc(db, 'users', currentUser.uid), newProfile);
              // setProfile will be triggered by onSnapshot
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`, currentUser);
            }
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`, currentUser);
          setLoading(false);
        });
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Fetch all users for admin/super
  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'superviseur') {
      const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(users);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users', user));
      return () => unsubscribe();
    }
  }, [profile, user]);

  // Fetch attendance records
  useEffect(() => {
    if (user && profile) {
      let q;
      if (profile.role === 'admin' || profile.role === 'superviseur') {
        q = query(collection(db, 'attendance'));
      } else {
        q = query(collection(db, 'attendance'), where('userId', '==', user.uid));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAttendance(records);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendance', user));
      return () => unsubscribe();
    }
  }, [user, profile]);

  const handleUpdateUser = async (uid: string, data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...data,
        lastUpdatedBy: user.uid,
        lastUpdatedByName: profile.displayName,
        lastUpdatedAt: Timestamp.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`, user);
    }
  };

  const handleCreateUser = async (data: any) => {
    if (!user || !profile) return;
    
    // Use a secondary app instance to create the user without logging out the current one
    let secondaryApp;
    try {
      secondaryApp = getApp('Secondary');
    } catch (e) {
      secondaryApp = initializeApp(firebaseConfig, 'Secondary');
    }
    const secondaryAuth = getAuth(secondaryApp);
    
    try {
      const email = `${data.username}@attendance.app`;
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, data.password);
      const uid = userCredential.user.uid;

      const userDoc: UserProfile = {
        uid: uid,
        displayName: data.displayName,
        email: email,
        role: data.role,
        roles: data.roles,
        username: data.username,
        dailyRate: data.dailyRate,
        photoURL: data.photoURL,
        suspended: false,
        createdAt: Timestamp.now(),
        lastUpdatedBy: user.uid,
        lastUpdatedByName: profile.displayName,
        lastUpdatedAt: Timestamp.now()
      };
      
      await setDoc(doc(db, 'users', uid), userDoc);
      
      // Sign out from the secondary app to clean up
      await secondaryAuth.signOut();
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw error;
    }
  };
  const workerStats = useMemo(() => {
    if (!profile) return null;
    
    const stats: Record<string, { presentDays: number, totalPay: number }> = {};
    
    if (profile.role === 'admin' || profile.role === 'superviseur') {
      allUsers.filter(u => u.role === 'ouvrier').forEach(worker => {
        const workerRecords = attendance.filter(r => r.userId === worker.uid && r.status === 'present');
        const dailyRate = worker.dailyRate || 0;
        stats[worker.uid] = {
          presentDays: workerRecords.length,
          totalPay: workerRecords.length * dailyRate
        };
      });
    } else if (profile.role === 'ouvrier') {
      const workerRecords = attendance.filter(r => r.userId === profile.uid && r.status === 'present');
      const dailyRate = profile.dailyRate || 0;
      stats[profile.uid] = {
        presentDays: workerRecords.length,
        totalPay: workerRecords.length * dailyRate
      };
    }
    return stats;
  }, [profile, allUsers, attendance]);

  const handleSetTime = async (userId: string, type: 'checkIn' | 'checkOut', specificTime?: string) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'superviseur') || !userId || userId === 'undefined') {
      console.error('handleSetTime: Missing userId or unauthorized');
      return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === userId && r.date === dateStr);

    let timestamp;
    if (specificTime) {
      const [hours, minutes] = specificTime.split(':').map(Number);
      const timeDate = new Date(selectedDate);
      timeDate.setHours(hours, minutes, 0, 0);
      timestamp = Timestamp.fromDate(timeDate);
    } else {
      timestamp = serverTimestamp();
    }

    try {
      if (existingRecord) {
        const hasCheckIn = type === 'checkIn' || !!existingRecord.checkIn;
        
        await updateDoc(doc(db, 'attendance', existingRecord.id), {
          [type]: timestamp,
          status: hasCheckIn ? 'present' : 'absent',
          timestamp: serverTimestamp(),
          updatedBy: profile.uid,
          updatedByName: profile.displayName
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: type === 'checkIn' ? 'present' : 'absent',
          markedBy: profile.uid,
          markedByName: profile.displayName,
          [type]: timestamp,
          timestamp: serverTimestamp(),
          updatedBy: profile.uid,
          updatedByName: profile.displayName
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance', user);
    }
  };

  const handleSetAbsent = async (userId: string) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'superviseur') || !userId || userId === 'undefined') {
      console.error('handleSetAbsent: Missing userId or unauthorized');
      return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === userId && r.date === dateStr);

    try {
      if (existingRecord) {
        await updateDoc(doc(db, 'attendance', existingRecord.id), {
          status: 'absent',
          checkIn: null,
          checkOut: null,
          timestamp: serverTimestamp(),
          updatedBy: profile.uid,
          updatedByName: profile.displayName
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: 'absent',
          markedBy: profile.uid,
          markedByName: profile.displayName,
          timestamp: serverTimestamp(),
          updatedBy: profile.uid,
          updatedByName: profile.displayName
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance', user);
    }
  };

  const logout = () => {
    signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const todayRecord = useMemo(() => {
    if (!user) return null;
    return attendance.find(r => r.userId === user.uid && r.date === format(new Date(), 'yyyy-MM-dd'));
  }, [user, attendance]);

  const roleColor = useMemo(() => {
    return ROLE_COLORS[profile?.role || 'personnel'] || ROLE_COLORS.personnel;
  }, [profile?.role]);

  const isAuthorizedToMark = isAdminOrSuper(profile);

  const themeColor = useMemo(() => {
    return roleColor;
  }, [roleColor]);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const handleToggleSuspension = async (userId: string, currentStatus: boolean) => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'superviseur')) return;
    try {
      await updateDoc(doc(db, 'users', userId), {
        suspended: !currentStatus,
        lastUpdatedBy: profile.uid,
        lastUpdatedByName: profile.displayName,
        lastUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`, user);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { 
        role: newRole,
        lastUpdatedBy: profile.uid,
        lastUpdatedByName: profile.displayName,
        lastUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`, user);
    }
  };

  const handleUpdateDailyRate = async (userId: string, rate: number) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { 
        dailyRate: rate,
        lastUpdatedBy: profile.uid,
        lastUpdatedByName: profile.displayName,
        lastUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`, user);
    }
  };

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {loading ? (
          <LoadingScreen key="loading" />
        ) : !user ? (
          <LoginScreen key="login" />
        ) : (
          <motion.div 
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("min-h-screen font-sans transition-colors duration-500", themeColor.bg, "selection:bg-slate-200")}
          >
            {/* Header */}
            <header className={cn(
              "sticky top-0 z-50 transition-all duration-500 border-b backdrop-blur-md",
              profile?.role === 'admin' 
                ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/10" 
                : cn("bg-white/80 border-slate-200", themeColor.border)
            )}>
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg transform hover:scale-105",
                profile?.role === 'admin' ? "bg-white text-emerald-600" : `${themeColor.bgPrimary} text-white shadow-current/20`
              )}>
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className={cn(
                  "font-black text-xl leading-tight tracking-tighter hidden sm:inline",
                  profile?.role === 'admin' ? "text-white" : "text-slate-800"
                )}>Suivi de Présence</span>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em] hidden sm:inline opacity-70",
                  profile?.role === 'admin' ? "text-emerald-50" : themeColor.text
                )}>Système de Gestion</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs hover:bg-emerald-200 transition-all"
                >
                  <Upload className="w-4 h-4 rotate-180" />
                  Installer
                </button>
              )}
              <div 
                className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setIsProfileModalOpen(true)}
              >
                <div className="hidden sm:flex flex-col items-end">
                  <span className={cn("font-semibold", isAdmin(profile) ? "text-white" : "text-slate-700")}>{profile?.displayName}</span>
                  <span className={cn(
                    "text-xs capitalize flex items-center gap-1 font-bold",
                    isAdmin(profile) ? "text-emerald-100" : themeColor.textPrimary
                  )}>
                    {isAdmin(profile) && <ShieldCheck className="w-3 h-3" />}
                    {isSuper(profile) && <ShieldCheck className="w-3 h-3 text-purple-500" />}
                    {hasRole(profile, 'personnel') && <UserIcon className="w-3 h-3" />}
                    {hasRole(profile, 'stagiaire') && <UserIcon className="w-3 h-3" />}
                    {hasRole(profile, 'ouvrier') && <UserIcon className="w-3 h-3" />}
                    {profile?.roles ? profile.roles.join(' & ') : profile?.role}
                  </span>
                </div>
                <img 
                  src={profile?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                  alt="Avatar" 
                  className={cn(
                    "w-10 h-10 rounded-full border-2",
                    profile?.role === 'admin' ? "border-white/50" : themeColor.border
                  )}
                  referrerPolicy="no-referrer"
                />
              </div>
              <button 
                onClick={logout}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  profile?.role === 'admin' 
                    ? "text-emerald-100 hover:text-white hover:bg-white/10" 
                    : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                )}
                title="Se déconnecter"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Calendar & Stats */}
            <div className="lg:col-span-4 space-y-8">
              {/* Check-In/Out Card (User Only) */}
              {profile?.role !== 'admin' && profile?.role !== 'superviseur' && (
                <div className={cn("bg-white p-6 rounded-[2rem] shadow-xl border overflow-hidden relative transition-all duration-500", `${themeColor.shadow} ${themeColor.border}`)}>
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Clock className="w-24 h-24" />
                  </div>
                  <h2 className="font-bold text-lg flex items-center gap-2 mb-6">
                    <Clock className={cn("w-5 h-5", themeColor.textPrimary)} />
                    Suivi Quotidien
                  </h2>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-1">Arrivée</div>
                        <div className="text-lg font-black text-slate-700">
                          {todayRecord?.checkIn ? format(todayRecord.checkIn.toDate(), 'HH:mm') : '--:--'}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-1">Départ</div>
                        <div className="text-lg font-black text-slate-700">
                          {todayRecord?.checkOut ? format(todayRecord.checkOut.toDate(), 'HH:mm') : '--:--'}
                        </div>
                      </div>
                    </div>

                    {todayRecord?.checkIn && todayRecord?.checkOut ? (
                      <div className="w-full flex items-center justify-center gap-3 bg-green-50 text-green-600 py-4 rounded-2xl font-bold border border-green-100">
                        <CheckCircle2 className="w-5 h-5" />
                        Journée terminée
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-slate-50 rounded-2xl text-slate-400 text-sm italic">
                        Le pointage digital doit être effectué par un administrateur ou superviseur.
                      </div>
                    )}

                    {profile?.role === 'ouvrier' && profile.dailyRate && (
                      <AnimatePresence>
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className={cn("p-4 rounded-2xl border flex items-center justify-between transition-all duration-500 shadow-sm", `${themeColor.bg} ${themeColor.border}`)}
                        >
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paie Actualisée</div>
                            <div className={cn("text-xl font-black", themeColor.textPrimary)}>
                              {((workerStats?.[profile.uid]?.totalPay || 0)).toLocaleString()} FCFA
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Jours validés</div>
                            <div className="text-lg font-bold text-slate-700">
                              {workerStats?.[profile.uid]?.presentDays || 0} j
                            </div>
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              )}

              {/* Calendar Card */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <CalendarIcon className={cn("w-5 h-5", themeColor.textPrimary)} />
                    Calendrier
                  </h2>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowCalendar(!showCalendar)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 flex items-center gap-2 text-sm font-medium"
                      title={showCalendar ? "Masquer le calendrier" : "Afficher le calendrier"}
                    >
                      {showCalendar ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      <span className="hidden sm:inline">{showCalendar ? "Masquer" : "Afficher"}</span>
                    </button>
                    {showCalendar && (
                      <div className="flex gap-1">
                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {!showCalendar ? (
                    <motion.div 
                      key="selected-date"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center justify-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200"
                    >
                      <div className="text-center">
                        <div className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Date sélectionnée</div>
                        <div className="text-xl font-bold text-slate-700 capitalize">
                          {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="calendar-grid"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="text-center mb-4 font-semibold text-slate-600 capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
                        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <div key={`${d}-${i}`}>{d}</div>)}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {eachDayOfInterval({
                          start: startOfMonth(currentMonth),
                          end: endOfMonth(currentMonth)
                        }).map(day => {
                          const isSelected = isSameDay(day, selectedDate);
                          const isTodayDate = isToday(day);
                          const record = attendance.find(r => r.userId === user.uid && r.date === format(day, 'yyyy-MM-dd'));
                          
                          return (
                            <button
                              key={day.toString()}
                              onClick={() => setSelectedDate(day)}
                              className={cn(
                                "aspect-square flex items-center justify-center text-sm rounded-xl transition-all relative",
                                isSelected ? `${themeColor.bgPrimary} text-white shadow-md ${themeColor.shadow}` : "hover:bg-slate-50",
                                !isSelected && isTodayDate && `${themeColor.textPrimary} font-bold ring-2 ${themeColor.ring}`
                              )}
                            >
                              {format(day, 'd')}
                              {!isSelected && (isBefore(day, startOfDay(new Date())) || isToday(day)) && (
                                <div className={cn(
                                  "absolute bottom-1 w-1 h-1 rounded-full",
                                  record?.status === 'present' ? "bg-green-500" : "bg-red-500"
                                )} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Stats Section (Only for non-admins here) */}
              {profile?.role !== 'admin' && profile?.role !== 'superviseur' && (
                <div className="space-y-6">
                  <StatsCard 
                    title="Stats Mensuelles"
                    periodLabel={format(currentMonth, 'MMMM yyyy', { locale: fr })}
                    records={attendance.filter(r => 
                      r.userId === user.uid && r.date.startsWith(format(currentMonth, 'yyyy-MM'))
                    )}
                    color={themeColor}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Main Content */}
            <div className="lg:col-span-8">
              {isAuthorizedToMark ? (
                <div className={cn("bg-white rounded-3xl shadow-xl border overflow-hidden transition-all duration-500", `${themeColor.border} ${themeColor.shadow}`)}>
                  <div className={cn("p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4", themeColor.border, `${themeColor.bg} opacity-80`)}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          <Users className={cn("w-6 h-6", themeColor.textPrimary)} />
                          Marquer la présence
                        </h2>
                        <p className="text-slate-500 text-sm capitalize">Marquage pour {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setIsCreateUserModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-md"
                      >
                        <UserPlus className="w-4 h-4" />
                        Nouveau Compte
                      </button>
                      {isToday(selectedDate) && (
                        <span className={cn("px-3 py-1 text-xs font-bold rounded-full self-start sm:self-auto uppercase shadow-sm", `${themeColor.bgPrimary} text-white`)}>Aujourd'hui</span>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-slate-50/50 border-b flex flex-wrap gap-2 items-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      Filtrer :
                    </div>
                    <button 
                      onClick={() => setRoleFilter('all')}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        roleFilter === 'all' ? `${themeColor.bgPrimary} text-white shadow-md` : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                      )}
                    >
                      Tous
                    </button>
                    {(['superviseur', 'personnel', 'stagiaire', 'ouvrier'] as UserRole[]).map(role => (
                      <button 
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                          roleFilter === role ? `${ROLE_COLORS[role].bgPrimary} text-white shadow-md` : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {role}s
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {allUsers
                      .filter(u => u.role !== 'admin' && (roleFilter === 'all' || u.role === roleFilter))
                      .map((u, index) => {
                        const record = attendance.find(r => r.userId === u.uid && r.date === format(selectedDate, 'yyyy-MM-dd'));
                        const uColor = ROLE_COLORS[u.role] || ROLE_COLORS.personnel;
                        
                        return (
                          <div key={u.uid || `user-${index}`} className={cn(
                            "p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors",
                            record?.status === 'present' ? "bg-green-50/30 hover:bg-green-50/50" : "bg-red-50/30 hover:bg-red-50/50",
                            !record && "bg-white hover:bg-slate-50/50"
                          )}>
                            <div className="flex items-center gap-4">
                              <button 
                                onClick={() => {
                                  setSelectedUserForConsult(u);
                                  setIsConsultModalOpen(true);
                                }}
                                className="relative group"
                                title="Consulter le profil"
                              >
                                <img 
                                  src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} 
                                  alt={u.displayName} 
                                  className={cn("w-12 h-12 rounded-2xl bg-slate-100 group-hover:ring-2 transition-all", `group-hover:ring-${uColor.primary}/40`)}
                                />
                                <div className={cn("absolute inset-0 flex items-center justify-center rounded-2xl transition-all", "bg-slate-900/0 group-hover:bg-slate-900/10")}>
                                  <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                              </button>
                              <div>
                                <div className="font-bold text-slate-800 flex items-center gap-2">
                                  {u.displayName}
                                  <button 
                                    onClick={() => {
                                      setSelectedUserForConsult(u);
                                      setIsConsultModalOpen(true);
                                    }}
                                    className={cn("p-1 hover:bg-slate-200 rounded-md transition-colors text-slate-400", `hover:text-${uColor.primary}`)}
                                    title="Consulter le profil"
                                  >
                                    <UserIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-xs text-slate-400">{u.email || 'Sans email'}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                                    record?.status === 'present' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                  )}>
                                    {record?.status === 'present' ? 'Présent' : 'Absent'}
                                  </div>
                                  <div className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                                    uColor.bg, uColor.text
                                  )}>
                                    {u.role}
                                  </div>
                                  {u.suspended && (
                                    <div className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-600 text-white animate-pulse">
                                      Suspendu
                                    </div>
                                  )}
                                  {u.role === 'ouvrier' && (
                                    <div className="text-[10px] font-bold text-orange-600">
                                      {workerStats?.[u.uid]?.totalPay.toLocaleString()} F
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1">
                                  {editingTime?.userId === u.uid && editingTime?.type === 'checkIn' ? (
                                    <div className="flex items-center gap-1">
                                      <input 
                                        type="time" 
                                        value={tempTime}
                                        onChange={(e) => setTempTime(e.target.value)}
                                        className="text-[10px] font-bold bg-white border border-slate-200 rounded px-1 py-0.5"
                                      />
                                      <button 
                                        onClick={() => {
                                          handleSetTime(u.uid, 'checkIn', tempTime);
                                          setEditingTime(null);
                                        }}
                                        className="p-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={() => setEditingTime(null)}
                                        className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                      >
                                        <XCircle className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        if (record?.checkIn) {
                                          setEditingTime({ userId: u.uid, type: 'checkIn' });
                                          setTempTime(format(record.checkIn.toDate(), 'HH:mm'));
                                        } else {
                                          handleSetTime(u.uid, 'checkIn');
                                        }
                                      }}
                                      className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                        record?.checkIn 
                                          ? `${uColor.bg} ${uColor.text} hover:${uColor.ring}` 
                                          : "bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                                      )}
                                    >
                                      <Clock className="w-3 h-3" />
                                      {record?.checkIn ? "Arr : " + format(record.checkIn.toDate(), 'HH:mm') : "Arrivée"}
                                    </button>
                                  )}

                                  {editingTime?.userId === u.uid && editingTime?.type === 'checkOut' ? (
                                    <div className="flex items-center gap-1">
                                      <input 
                                        type="time" 
                                        value={tempTime}
                                        onChange={(e) => setTempTime(e.target.value)}
                                        className="text-[10px] font-bold bg-white border border-slate-200 rounded px-1 py-0.5"
                                      />
                                      <button 
                                        onClick={() => {
                                          handleSetTime(u.uid, 'checkOut', tempTime);
                                          setEditingTime(null);
                                        }}
                                        className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={() => setEditingTime(null)}
                                        className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                      >
                                        <XCircle className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        if (record?.checkOut) {
                                          setEditingTime({ userId: u.uid, type: 'checkOut' });
                                          setTempTime(format(record.checkOut.toDate(), 'HH:mm'));
                                        } else {
                                          handleSetTime(u.uid, 'checkOut');
                                        }
                                      }}
                                      className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                        record?.checkOut 
                                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                                          : "bg-slate-50 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                                      )}
                                    >
                                      <Clock className="w-3 h-3" />
                                      {record?.checkOut ? "Dép : " + format(record.checkOut.toDate(), 'HH:mm') : "Départ"}
                                    </button>
                                  )}
                                  
                                  <button 
                                    onClick={() => handleSetAbsent(u.uid)}
                                    className={cn(
                                      "p-1.5 rounded-lg transition-all",
                                      record?.status === 'absent' && !record?.checkIn && !record?.checkOut
                                        ? "bg-red-100 text-red-600"
                                        : "bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    )}
                                    title="Marquer absent"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                                {record?.updatedByName && (
                                  <div className="text-[8px] text-slate-400 italic mt-0.5 flex items-center gap-1">
                                    <ShieldCheck className="w-2 h-2" />
                                    {record.updatedByName} • {format(record.timestamp.toDate(), 'dd/MM HH:mm')}
                                  </div>
                                )}
                              </div>

                              {/* Admin & Superviseur: Role & Rate management */}
                              {isAuthorizedToMark && (
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                                  <select 
                                    value={u.role}
                                    disabled={profile.role !== 'admin'} // Only admin can change roles
                                    onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserRole)}
                                    className="text-[9px] font-bold uppercase tracking-wider bg-slate-50 border-none rounded-md px-2 py-1 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                                  >
                                    <option value="personnel">Personnel</option>
                                    <option value="stagiaire">Stagiaire</option>
                                    <option value="ouvrier">Ouvrier</option>
                                    <option value="superviseur">Superviseur</option>
                                  </select>

                                  <button 
                                    onClick={() => handleToggleSuspension(u.uid, !!u.suspended)}
                                    className={cn(
                                      "p-1 rounded-md transition-all",
                                      u.suspended 
                                        ? "bg-green-100 text-green-600 hover:bg-green-200" 
                                        : "bg-amber-100 text-amber-600 hover:bg-amber-200"
                                    )}
                                    title={u.suspended ? "Réactiver" : "Suspendre"}
                                  >
                                    {u.suspended ? <CheckCircle2 className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                  </button>

                                  {u.role === 'ouvrier' && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] font-bold text-slate-400">PAIE:</span>
                                      <input 
                                        type="number"
                                        value={u.dailyRate || ''}
                                        onChange={(e) => handleUpdateDailyRate(u.uid, parseInt(e.target.value) || 0)}
                                        placeholder="Taux"
                                        className="w-16 text-[9px] font-bold bg-slate-50 border-none rounded-md px-2 py-1 focus:ring-1 focus:ring-orange-500"
                                      />
                                    </div>
                                  )}
                                  {u.lastUpdatedByName && (
                                    <div className="text-[8px] text-slate-400 italic flex items-center gap-1 ml-auto">
                                      <ShieldCheck className="w-2 h-2" />
                                      {u.lastUpdatedByName} • {format(u.lastUpdatedAt?.toDate() || new Date(), 'dd/MM HH:mm')}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {allUsers.filter(u => u.role !== 'admin' && (roleFilter === 'all' || u.role === roleFilter)).length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>Aucun utilisateur trouvé {roleFilter !== 'all' ? `pour le rôle ${roleFilter}` : 'dans le système'}.</p>
                      </div>
                    )}
                  </div>

                  {/* Admin Stats Section (Moved to bottom) */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-8">
                    <AdminStatsGrid 
                      title={roleFilter === 'all' ? "Statistiques du jour" : `Stats : ${roleFilter}s`}
                      periodLabel={format(selectedDate, 'dd MMMM yyyy', { locale: fr })}
                      records={roleFilter === 'all' ? attendance : attendance.filter(r => {
                        const u = allUsers.find(user => user.uid === r.userId);
                        return u && u.role === roleFilter;
                      })}
                      totalUsers={allUsers.filter(u => u.role !== 'admin' && (roleFilter === 'all' || u.role === roleFilter)).length}
                      date={selectedDate}
                      color={roleFilter === 'all' ? themeColor : ROLE_COLORS[roleFilter as UserRole]}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className={cn("bg-white p-8 rounded-3xl shadow-sm border", themeColor.border)}>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold">Votre historique</h2>
                      <div className={cn("px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest", themeColor.bg, themeColor.text)}>
                        {profile?.role}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {eachDayOfInterval({
                        start: subDays(new Date(), 6),
                        end: new Date()
                      }).reverse().map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const record = attendance.find(r => r.userId === user.uid && r.date === dateStr);
                        
                        return (
                          <div key={dateStr} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                record?.status === 'present' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                              )}>
                                {record?.status === 'present' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                              </div>
                              <div>
                                <div className="font-bold capitalize text-sm">{format(day, 'EEEE d MMMM yyyy', { locale: fr })}</div>
                                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record?.checkIn ? format(record.checkIn.toDate(), 'HH:mm') : '--:--'}</span>
                                  <ArrowRightLeft className="w-2 h-2" />
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record?.checkOut ? format(record.checkOut.toDate(), 'HH:mm') : '--:--'}</span>
                                </div>
                              </div>
                            </div>
                            <div className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              record?.status === 'present' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {record?.status === 'present' ? 'Présent' : 'Absent'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* User Detail Modal */}
        <UserDetailModal 
          isOpen={isConsultModalOpen}
          onClose={() => {
            setIsConsultModalOpen(false);
            setSelectedUserForConsult(null);
          }}
          userProfile={selectedUserForConsult}
          attendanceRecords={attendance}
          workerStats={workerStats}
          currentProfile={profile}
          onUpdateUser={handleUpdateUser}
        />

        {/* Create User Modal */}
        <CreateUserModal 
          isOpen={isCreateUserModalOpen}
          onClose={() => setIsCreateUserModalOpen(false)}
          onCreated={handleCreateUser}
          currentProfile={profile}
        />

        <ProfileModal 
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          profile={profile}
          user={user}
          themeColor={themeColor}
        />
      </motion.div>
    )}
  </AnimatePresence>
</ErrorBoundary>
);
}
