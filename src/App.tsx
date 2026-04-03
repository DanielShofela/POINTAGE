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
  secondaryAuth,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
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
  OperationType,
  handleFirestoreError,
  User
} from './firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
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
  EyeOff
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
  dailyRate?: number; // Pour les ouvriers
}

const ROLE_COLORS: Record<UserRole, { primary: string, bg: string, text: string, ring: string, border: string }> = {
  admin: { primary: 'emerald-600', bg: 'emerald-50', text: 'emerald-700', ring: 'emerald-100', border: 'border-emerald-200' },
  superviseur: { primary: 'purple-600', bg: 'purple-50', text: 'purple-700', ring: 'purple-100', border: 'border-purple-200' },
  personnel: { primary: 'blue-600', bg: 'blue-50', text: 'blue-700', ring: 'blue-100', border: 'border-blue-200' },
  stagiaire: { primary: 'teal-600', bg: 'teal-50', text: 'teal-700', ring: 'teal-100', border: 'border-teal-200' },
  ouvrier: { primary: 'orange-600', bg: 'orange-50', text: 'orange-700', ring: 'orange-100', border: 'border-orange-200' }
};

const STATUS_COLORS = {
  present: { primary: 'green-600', bg: 'green-50', text: 'green-700', ring: 'green-100', border: 'border-green-200' },
  absent: { primary: 'red-600', bg: 'red-50', text: 'red-700', ring: 'red-100', border: 'border-red-200' },
  none: { primary: 'slate-400', bg: 'slate-50', text: 'slate-600', ring: 'slate-100', border: 'border-slate-200' }
};

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent';
  markedBy: string;
  checkIn?: Timestamp;
  checkOut?: Timestamp;
  timestamp: Timestamp;
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

const AdminStatsGrid = ({ title, records, periodLabel, totalUsers, date, color }: { title: string, records: AttendanceRecord[], periodLabel: string, totalUsers: number, date: Date, color?: { primary: string, bg: string, text: string, ring: string } }) => {
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
          <BarChart3 className={cn("w-4 h-4", color ? `text-${color.primary}` : "text-emerald-600")} />
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
        <div className={cn("flex items-center justify-between p-4 rounded-2xl shadow-md", color ? `bg-${color.primary} shadow-${color.primary}/20` : "bg-emerald-600 shadow-emerald-100")}>
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

const StatsCard = ({ title, records, periodLabel, color }: { title: string, records: AttendanceRecord[], periodLabel: string, color?: { primary: string, bg: string, text: string, ring: string } }) => {
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const totalRecords = records.length;
  
  const rate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

  return (
    <div className={cn("bg-white p-6 rounded-3xl shadow-sm border", color ? `border-${color.ring}` : "border-slate-200")}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BarChart3 className={cn("w-5 h-5", color ? `text-${color.primary}` : "text-emerald-600")} />
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
        <div className={cn("pt-4 border-t text-center", color ? `border-${color.ring}` : "border-slate-100")}>
          <div className={cn("text-3xl font-black", color ? `text-${color.primary}` : "text-emerald-600")}>{rate}%</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Taux de présence</div>
        </div>
      </div>
    </div>
  );
};

const UserConsultationModal = ({ 
  isOpen, 
  onClose, 
  userProfile, 
  attendanceRecords,
  workerStats,
  color
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userProfile: UserProfile | null, 
  attendanceRecords: AttendanceRecord[],
  workerStats: Record<string, { presentDays: number, totalPay: number }> | null,
  color?: { primary: string, bg: string, text: string, ring: string }
}) => {
  if (!userProfile) return null;

  const userRecords = attendanceRecords
    .filter(r => r.userId === userProfile.uid)
    .sort((a, b) => b.date.localeCompare(a.date));

  const uColor = ROLE_COLORS[userProfile.role] || ROLE_COLORS.personnel;
  const stats = workerStats?.[userProfile.uid];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className={cn("p-6 border-b flex items-center justify-between text-white", `bg-${uColor.primary}`)}>
              <div className="flex items-center gap-4">
                <img 
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`} 
                  alt={userProfile.displayName} 
                  className="w-12 h-12 rounded-2xl bg-white/20"
                />
                <div>
                  <h3 className="font-bold text-xl">{userProfile.displayName}</h3>
                  <p className="text-white/80 text-sm">{userProfile.email || 'Sans email'} • <span className="capitalize">{userProfile.role}</span></p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-6">
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

const LoginScreen = ({ onManualLogin }: { onManualLogin: (user: UserProfile) => void }) => {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'google' | 'manual'>('google');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      // Check if it's a legacy user (created before Auth integration)
      try {
        const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data() as UserProfile;
          if (userData.uid.startsWith('manual_')) {
            setLoginError("Ce compte a été créé avec l'ancien système. Veuillez demander à l'administrateur de supprimer et recréer votre compte.");
            setIsLoggingIn(false);
            return;
          }
        }
      } catch (e) {
        console.error('Error checking legacy user:', e);
      }

      if (error.code === 'auth/operation-not-allowed') {
        setLoginError('ERREUR : La méthode de connexion par "Email/Password" n\'est pas activée dans la console Firebase. Veuillez l\'activer pour utiliser la connexion par identifiants.');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError('Nom d\'utilisateur ou mot de passe incorrect.');
      } else {
        setLoginError('Erreur lors de la connexion.');
        console.error(error);
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
              "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
              loginType === 'google' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Google
          </button>
          <button 
            onClick={() => setLoginType('manual')}
            className={cn(
              "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
              loginType === 'manual' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Identifiants
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
        ) : (
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [editingTime, setEditingTime] = useState<{ userId: string, type: 'checkIn' | 'checkOut' } | null>(null);
  const [tempTime, setTempTime] = useState('');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newUser, setNewUser] = useState({ displayName: '', role: 'ouvrier', dailyRate: 0, username: '', password: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Listen to the user's profile in real-time
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubProfile = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            setProfile({ uid: userDoc.id, ...userDoc.data() } as UserProfile);
          } else {
            // Create default profile if it doesn't exist
            const isDefaultAdmin = currentUser.email === 'daniel.shofela01@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Anonyme',
              role: isDefaultAdmin ? 'admin' : 'personnel'
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

        return () => unsubProfile();
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
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

  // Calculate worker pay
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
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: type === 'checkIn' ? 'present' : 'absent',
          markedBy: profile.uid,
          [type]: timestamp,
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance', user);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.displayName) return;
    
    setLoading(true);
    try {
      const cleanUsername = newUser.username?.trim().toLowerCase();
      let uid = `manual_${Date.now()}`;
      
      // If username/password provided, create a real Firebase Auth account
      if (cleanUsername && newUser.password) {
        if (newUser.password.length < 6) {
          throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
        }
        const email = `${cleanUsername}@attendance.app`;
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newUser.password);
          uid = userCredential.user.uid;
          // Log out the secondary app immediately to be safe
          await signOut(secondaryAuth);
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            throw new Error('Ce nom d\'utilisateur est déjà utilisé.');
          }
          if (authError.code === 'auth/weak-password') {
            throw new Error('Le mot de passe est trop court (minimum 6 caractères).');
          }
          throw authError;
        }
      }

      const userDoc: UserProfile = {
        uid: uid,
        displayName: newUser.displayName,
        role: newUser.role as UserProfile['role'],
        dailyRate: newUser.dailyRate,
        username: cleanUsername || undefined,
      };
      
      await setDoc(doc(db, 'users', uid), userDoc);
      setIsAddUserModalOpen(false);
      setNewUser({ displayName: '', role: 'ouvrier', dailyRate: 0, username: '', password: '' });
    } catch (error: any) {
      if (error.code === 'auth/operation-not-allowed') {
        alert('ERREUR : Vous devez activer "Email/Password" dans la console Firebase (Authentication > Sign-in method) pour créer des comptes avec identifiants.');
      } else {
        alert(error.message || 'Erreur lors de la création de l\'utilisateur');
      }
      console.error(error);
    } finally {
      setLoading(false);
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
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: 'absent',
          markedBy: profile.uid,
          timestamp: serverTimestamp()
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

  const isAdminOrSuper = profile?.role === 'admin' || profile?.role === 'superviseur';

  const themeColor = useMemo(() => {
    return roleColor;
  }, [roleColor]);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onManualLogin={() => {}} />;

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`, user);
    }
  };

  const handleUpdateDailyRate = async (userId: string, rate: number) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { dailyRate: rate });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`, user);
    }
  };

  return (
    <ErrorBoundary>
      <div className={cn("min-h-screen font-sans transition-colors duration-500", `bg-${themeColor.bg}`, `selection:bg-${themeColor.primary}/20`)}>
        {/* Header */}
        <header className={cn(
          "sticky top-0 z-50 transition-all duration-500 border-b backdrop-blur-md",
          profile?.role === 'admin' 
            ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/10" 
            : cn("bg-white/80 border-slate-200", `border-${themeColor.primary}/20`)
        )}>
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg transform hover:scale-105",
                profile?.role === 'admin' ? "bg-white text-emerald-600" : `bg-${themeColor.primary} text-white shadow-current/20`
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
                  profile?.role === 'admin' ? "text-emerald-50" : `text-${themeColor.text}`
                )}>Système de Gestion</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="hidden sm:flex flex-col items-end">
                  <span className={cn("font-semibold", profile?.role === 'admin' ? "text-white" : "text-slate-700")}>{profile?.displayName}</span>
                  <span className={cn(
                    "text-xs capitalize flex items-center gap-1 font-bold",
                    profile?.role === 'admin' ? "text-emerald-100" : `text-${themeColor.primary}`
                  )}>
                    {profile?.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                    {profile?.role === 'superviseur' && <ShieldCheck className="w-3 h-3 text-purple-500" />}
                    {profile?.role === 'personnel' && <UserIcon className="w-3 h-3" />}
                    {profile?.role === 'stagiaire' && <UserIcon className="w-3 h-3" />}
                    {profile?.role === 'ouvrier' && <UserIcon className="w-3 h-3" />}
                    {profile?.role}
                  </span>
                </div>
                <img 
                  src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                  alt="Avatar" 
                  className={cn(
                    "w-10 h-10 rounded-full border-2",
                    profile?.role === 'admin' ? "border-white/50" : `border-${themeColor.ring}`
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
                <div className={cn("bg-white p-6 rounded-[2rem] shadow-xl border overflow-hidden relative transition-all duration-500", `shadow-${themeColor.primary}/10 border-${themeColor.ring}`)}>
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Clock className="w-24 h-24" />
                  </div>
                  <h2 className="font-bold text-lg flex items-center gap-2 mb-6">
                    <Clock className={cn("w-5 h-5", `text-${themeColor.primary}`)} />
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
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn("p-4 rounded-2xl border flex items-center justify-between transition-all duration-500 shadow-sm", `bg-${themeColor.bg} border-${themeColor.ring}`)}
                      >
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paie Actualisée</div>
                          <div className={cn("text-xl font-black", `text-${themeColor.primary}`)}>
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
                    )}
                  </div>
                </div>
              )}

              {/* Calendar Card */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <CalendarIcon className={cn("w-5 h-5", `text-${roleColor.primary}`)} />
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

                {!showCalendar ? (
                  <div className="flex items-center justify-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <div className="text-center">
                      <div className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Date sélectionnée</div>
                      <div className="text-xl font-bold text-slate-700 capitalize">
                        {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
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
                              isSelected ? `bg-${themeColor.primary} text-white shadow-md shadow-${themeColor.primary}/20` : "hover:bg-slate-50",
                              !isSelected && isTodayDate && `text-${themeColor.primary} font-bold ring-2 ring-${themeColor.ring}`
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
              {isAdminOrSuper ? (
                <div className={cn("bg-white rounded-3xl shadow-xl border overflow-hidden transition-all duration-500", `border-${themeColor.primary}/20 shadow-${themeColor.primary}/5`)}>
                  <div className={cn("p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4", `border-${themeColor.primary}/10`, `bg-${themeColor.bg}/20`)}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          <Users className={cn("w-6 h-6", `text-${themeColor.primary}`)} />
                          Marquer la présence
                        </h2>
                        <p className="text-slate-500 text-sm capitalize">Marquage pour {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                      </div>
                      <button 
                        onClick={() => setIsAddUserModalOpen(true)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm",
                          `bg-${themeColor.primary} text-white hover:opacity-90`
                        )}
                      >
                        <Users className="w-4 h-4" />
                        Nouveau Membre
                      </button>
                    </div>
                    {isToday(selectedDate) && (
                      <span className={cn("px-3 py-1 text-xs font-bold rounded-full self-start sm:self-auto uppercase shadow-sm", `bg-${themeColor.primary} text-white`)}>Aujourd'hui</span>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {allUsers.filter(u => u.role !== 'admin').map((u, index) => {
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
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} 
                                alt={u.displayName} 
                                className={cn("w-12 h-12 rounded-2xl bg-slate-100 group-hover:ring-2 transition-all", `group-hover:ring-${uColor.primary}/40`)}
                              />
                              <div className={cn("absolute inset-0 flex items-center justify-center rounded-2xl transition-all", `bg-${uColor.primary}/0 group-hover:bg-${uColor.primary}/20`)}>
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
                                  `bg-${uColor.bg} text-${uColor.text}`
                                )}>
                                  {u.role}
                                </div>
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
                                        ? `bg-${uColor.bg} text-${uColor.text} hover:bg-${uColor.ring}` 
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
                            </div>

                            {/* Admin & Superviseur: Role & Rate management */}
                            {isAdminOrSuper && (
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
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {allUsers.filter(u => u.role !== 'admin').length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>Aucun utilisateur trouvé dans le système.</p>
                      </div>
                    )}
                  </div>

                  {/* Admin Stats Section (Moved to bottom) */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-8">
                    <AdminStatsGrid 
                      title="Statistiques du jour"
                      periodLabel={format(selectedDate, 'dd MMMM yyyy', { locale: fr })}
                      records={attendance}
                      totalUsers={allUsers.filter(u => u.role !== 'admin').length}
                      date={selectedDate}
                      color={roleColor}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className={cn("bg-white p-8 rounded-3xl shadow-sm border", `border-${roleColor.ring}`)}>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold">Votre historique</h2>
                      <div className={cn("px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest", `bg-${roleColor.bg} text-${roleColor.text}`)}>
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

        {/* Add User Modal */}
        <AnimatePresence>
          {isAddUserModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              >
                <div className={cn("p-6 border-b flex items-center justify-between", `bg-${themeColor.bg}/30 border-${themeColor.primary}/10`)}>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className={cn("w-6 h-6", `text-${themeColor.primary}`)} />
                    Nouveau Membre
                  </h3>
                  <button onClick={() => setIsAddUserModalOpen(false)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                    <XCircle className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">Nom complet</label>
                    <input 
                      type="text" 
                      value={newUser.displayName}
                      onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                      placeholder="Ex: Jean Dupont"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">Rôle</label>
                    <select 
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserProfile['role'] })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                    >
                      <option value="ouvrier">Ouvrier</option>
                      <option value="personnel">Personnel</option>
                      <option value="stagiaire">Stagiaire</option>
                      <option value="superviseur">Superviseur</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-600 ml-1">Nom d'utilisateur</label>
                      <input 
                        type="text" 
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        placeholder="Optionnel"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-600 ml-1">Mot de passe</label>
                      <div className="relative">
                        <input 
                          type={showNewUserPassword ? "text" : "password"} 
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="Optionnel"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all pr-10"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showNewUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {newUser.password && newUser.password.length < 6 && (
                        <p className="text-[10px] text-red-500 font-medium mt-1 ml-1">
                          Minimum 6 caractères
                        </p>
                      )}
                    </div>
                  </div>

                  {newUser.role === 'ouvrier' && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-600 ml-1">Taux journalier (F)</label>
                      <input 
                        type="number" 
                        value={newUser.dailyRate}
                        onChange={(e) => setNewUser({ ...newUser, dailyRate: Number(e.target.value) })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                  )}
                </div>
                
                <div className="p-6 bg-slate-50 border-t flex gap-3">
                  <button 
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={handleAddUser}
                    disabled={!newUser.displayName}
                    className={cn(
                      "flex-1 px-4 py-3 rounded-xl font-bold text-white transition-all shadow-md",
                      newUser.displayName ? `bg-${themeColor.primary} hover:opacity-90` : "bg-slate-300 cursor-not-allowed"
                    )}
                  >
                    Enregistrer
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Consultation Modal */}
        <UserConsultationModal 
          isOpen={isConsultModalOpen}
          onClose={() => setIsConsultModalOpen(false)}
          userProfile={selectedUserForConsult}
          attendanceRecords={attendance}
          workerStats={workerStats}
          color={roleColor}
        />
      </div>
    </ErrorBoundary>
  );
}
