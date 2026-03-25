/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
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
  email: string;
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
  color
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userProfile: UserProfile | null, 
  attendanceRecords: AttendanceRecord[],
  color?: { primary: string, bg: string, text: string, ring: string }
}) => {
  if (!userProfile) return null;

  const userRecords = attendanceRecords
    .filter(r => r.userId === userProfile.uid)
    .sort((a, b) => b.date.localeCompare(a.date));

  const uColor = ROLE_COLORS[userProfile.role] || ROLE_COLORS.personnel;

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
                  <p className="text-white/80 text-sm">{userProfile.email} • <span className="capitalize">{userProfile.role}</span></p>
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

const LoginScreen = () => {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
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
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98]"
        >
          <LogIn className="w-5 h-5" />
          Se connecter avec Google
        </button>
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setProfile({ uid: userDoc.id, ...userDoc.data() } as UserProfile);
          } else {
            // Create default profile
            const isDefaultAdmin = currentUser.email === 'daniel.shofela01@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Anonyme',
              role: isDefaultAdmin ? 'admin' : 'personnel'
            };
            await setDoc(doc(db, 'users', currentUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch all users for admin/super
  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'superviseur') {
      const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(users);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
      return () => unsubscribe();
    }
  }, [profile]);

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
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendance'));
      return () => unsubscribe();
    }
  }, [user, profile]);

  // Calculate worker pay
  const workerStats = useMemo(() => {
    if (!profile || (profile.role !== 'ouvrier' && profile.role !== 'admin' && profile.role !== 'superviseur')) return null;
    
    const stats: Record<string, { presentDays: number, totalPay: number }> = {};
    
    allUsers.filter(u => u.role === 'ouvrier').forEach(worker => {
      const workerRecords = attendance.filter(r => r.userId === worker.uid && r.status === 'present');
      const dailyRate = worker.dailyRate || 0;
      stats[worker.uid] = {
        presentDays: workerRecords.length,
        totalPay: workerRecords.length * dailyRate
      };
    });
    return stats;
  }, [profile, allUsers, attendance]);

  const handleSetTime = async (userId: string, type: 'checkIn' | 'checkOut') => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'superviseur') || !userId || userId === 'undefined') {
      console.error('handleSetTime: Missing userId or unauthorized');
      return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === userId && r.date === dateStr);

    // Prevent overwriting existing time
    if (existingRecord && existingRecord[type]) {
      console.warn(`handleSetTime: ${type} already set for user ${userId} on ${dateStr}`);
      return;
    }

    try {
      if (existingRecord) {
        const hasCheckIn = type === 'checkIn' || !!existingRecord.checkIn;
        
        await updateDoc(doc(db, 'attendance', existingRecord.id), {
          [type]: serverTimestamp(),
          status: hasCheckIn ? 'present' : 'absent',
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: type === 'checkIn' ? 'present' : 'absent',
          markedBy: profile.uid,
          [type]: serverTimestamp(),
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
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
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const logout = () => signOut(auth);

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
  if (!user) return <LoginScreen />;

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    }
  };

  const handleUpdateDailyRate = async (userId: string, rate: number) => {
    if (profile?.role !== 'admin' && profile?.role !== 'superviseur') return;
    try {
      await updateDoc(doc(db, 'users', userId), { dailyRate: rate });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
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

                    {profile?.role === 'ouvrier' && profile.dailyRate && (
                      <div className={cn("p-4 rounded-2xl border flex items-center justify-between transition-all duration-500", `bg-${themeColor.bg} border-${themeColor.ring}`)}>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paie cumulée</div>
                          <div className={cn("text-xl font-black", `text-${themeColor.primary}`)}>
                            {((workerStats?.[profile.uid]?.totalPay || 0)).toLocaleString()} FCFA
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Présences</div>
                          <div className="text-lg font-bold text-slate-700">
                            {workerStats?.[profile.uid]?.presentDays || 0} j
                          </div>
                        </div>
                      </div>
                    )}

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
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Users className={cn("w-6 h-6", `text-${themeColor.primary}`)} />
                        Marquer la présence
                      </h2>
                      <p className="text-slate-500 text-sm capitalize">Marquage pour {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
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
                              <div className="text-xs text-slate-400">{u.email}</div>
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
                                <button 
                                  onClick={() => handleSetTime(u.uid, 'checkIn')}
                                  disabled={!!record?.checkIn}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                    record?.checkIn 
                                      ? `bg-${uColor.bg} text-${uColor.text} cursor-not-allowed opacity-80` 
                                      : "bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                                  )}
                                >
                                  <Clock className="w-3 h-3" />
                                  {record?.checkIn ? "Arr : " + format(record.checkIn.toDate(), 'HH:mm') : "Arrivée"}
                                </button>
                                <button 
                                  onClick={() => handleSetTime(u.uid, 'checkOut')}
                                  disabled={!!record?.checkOut}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                    record?.checkOut 
                                      ? "bg-slate-100 text-slate-700 cursor-not-allowed opacity-80" 
                                      : "bg-slate-50 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                                  )}
                                >
                                  <Clock className="w-3 h-3" />
                                  {record?.checkOut ? "Dép : " + format(record.checkOut.toDate(), 'HH:mm') : "Départ"}
                                </button>
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

        {/* Consultation Modal */}
        <UserConsultationModal 
          isOpen={isConsultModalOpen}
          onClose={() => setIsConsultModalOpen(false)}
          userProfile={selectedUserForConsult}
          attendanceRecords={attendance}
          color={roleColor}
        />
      </div>
    </ErrorBoundary>
  );
}
