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
  Fingerprint,
  Clock,
  ArrowRightLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  pin?: string;
}

// --- PIN Helpers ---
const verifyPin = (inputPin: string, userPin?: string) => {
  return inputPin === userPin;
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
      <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
      <p className="text-slate-600 font-medium">Chargement du suivi de présence...</p>
    </motion.div>
  </div>
);

const PinModal = ({ isOpen, onClose, onVerify, type, targetProfile }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onVerify: (uid?: string) => void, 
  type: 'check-in' | 'check-out',
  targetProfile: UserProfile | null
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(null);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      setError("Le PIN doit comporter 4 chiffres.");
      return;
    }

    if (verifyPin(pin, targetProfile?.pin)) {
      setSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      onVerify(targetProfile?.uid);
      onClose();
      setPin('');
      setSuccess(false);
    } else {
      setError("Code PIN incorrect.");
      setPin('');
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleSubmit();
    }
  }, [pin]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center shadow-2xl"
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-2 capitalize">
                {type === 'check-in' ? 'Arrivée' : 'Départ'}
              </h3>
              <p className="text-slate-500">Entrez votre code PIN pour valider.</p>
            </div>

            <div className="flex justify-center gap-3 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-4 h-4 rounded-full border-2 transition-all duration-200",
                    pin.length > i 
                      ? "bg-indigo-600 border-indigo-600 scale-110" 
                      : "border-slate-200"
                  )}
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm font-medium mb-6">{error}</p>}
            {success && <p className="text-green-600 text-sm font-bold mb-6">Code PIN correct !</p>}

            <div className="grid grid-cols-3 gap-4 mb-8">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  className="w-16 h-16 mx-auto rounded-2xl bg-slate-50 text-xl font-bold text-slate-700 hover:bg-slate-100 active:scale-90 transition-all"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                onClick={() => handleNumberClick('0')}
                className="w-16 h-16 mx-auto rounded-2xl bg-slate-50 text-xl font-bold text-slate-700 hover:bg-slate-100 active:scale-90 transition-all"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className="w-16 h-16 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 active:scale-90 transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <button 
              onClick={onClose}
              className="w-full text-slate-400 font-semibold py-2 hover:text-slate-600"
            >
              Annuler
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const AdminStatsGrid = ({ title, records, periodLabel }: { title: string, records: AttendanceRecord[], periodLabel: string }) => {
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const total = presentCount + absentCount;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600" />
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
        <div className="flex items-center justify-between p-4 bg-indigo-600 rounded-2xl shadow-md shadow-indigo-100">
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

const StatsCard = ({ title, records, periodLabel }: { title: string, records: AttendanceRecord[], periodLabel: string }) => {
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const total = presentCount + absentCount;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
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
        <div className="pt-4 border-t border-slate-100 text-center">
          <div className="text-3xl font-black text-indigo-600">{rate}%</div>
          <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Taux de présence</div>
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
  onSetPin,
  onPinCheck
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userProfile: UserProfile | null, 
  attendanceRecords: AttendanceRecord[],
  onSetPin: (u: UserProfile) => void,
  onPinCheck: (type: 'check-in' | 'check-out') => void
}) => {
  if (!userProfile) return null;

  const userRecords = attendanceRecords
    .filter(r => r.userId === userProfile.uid)
    .sort((a, b) => b.date.localeCompare(a.date));

  const todayRecord = attendanceRecords.find(r => r.userId === userProfile.uid && r.date === format(new Date(), 'yyyy-MM-dd'));

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
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
              <div className="flex items-center gap-4">
                <img 
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`} 
                  alt={userProfile.displayName} 
                  className="w-12 h-12 rounded-2xl bg-white/20"
                />
                <div>
                  <h3 className="font-bold text-xl">{userProfile.displayName}</h3>
                  <p className="text-indigo-100 text-sm">{userProfile.email}</p>
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
              {/* PIN Actions Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pointage par PIN
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  {!userProfile.pin ? (
                    <button 
                      onClick={() => onSetPin(userProfile)}
                      className="flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all border bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      Définir un Code PIN
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <button 
                          onClick={() => onPinCheck('check-in')}
                          disabled={!!todayRecord?.checkIn}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all border shadow-sm",
                            todayRecord?.checkIn 
                              ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed" 
                              : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 active:scale-95"
                          )}
                        >
                          <LogIn className="w-5 h-5" />
                          Arrivée
                        </button>
                        <button 
                          onClick={() => onPinCheck('check-out')}
                          disabled={!!todayRecord?.checkOut}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all border shadow-sm",
                            todayRecord?.checkOut 
                              ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed" 
                              : "bg-slate-800 text-white border-slate-800 hover:bg-slate-900 active:scale-95"
                          )}
                        >
                          <LogOut className="w-5 h-5" />
                          Départ
                        </button>
                      </div>
                      <button 
                        onClick={() => onSetPin(userProfile)}
                        className="w-full text-xs text-indigo-600 font-bold hover:underline"
                      >
                        Réinitialiser le Code PIN
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Historique de présence</h4>
                <div className="space-y-3">
                  {userRecords.length > 0 ? (
                    userRecords.map(record => (
                      <div key={record.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            record.status === 'present' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                          )}>
                            {record.status === 'present' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-700 capitalize">
                              {format(parseISO(record.date), 'EEEE d MMMM yyyy', { locale: fr })}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record.checkIn ? format(record.checkIn.toDate(), 'HH:mm') : '--:--'}</span>
                              <ArrowRightLeft className="w-2 h-2" />
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record.checkOut ? format(record.checkOut.toDate(), 'HH:mm') : '--:--'}</span>
                            </div>
                          </div>
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          record.status === 'present' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {record.status === 'present' ? 'Présent' : 'Absent'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-slate-200" />
                      <p className="text-slate-400 font-medium">Aucun enregistrement trouvé</p>
                    </div>
                  )}
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
        className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl shadow-indigo-100 border border-slate-100 text-center"
      >
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-200">
          <CalendarIcon className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Suivi de Présence</h1>
        <p className="text-slate-500 mb-8">Connectez-vous pour gérer ou consulter vos relevés de présence.</p>
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-200 active:scale-[0.98]"
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
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinType, setPinType] = useState<'check-in' | 'check-out'>('check-in');
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
              role: isDefaultAdmin ? 'admin' : 'user'
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

  // Fetch all users for admin
  useEffect(() => {
    if (profile?.role === 'admin') {
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
      if (profile.role === 'admin') {
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

  const handleMarkAttendance = async (userId: string, status: 'present' | 'absent') => {
    if (!profile || profile.role !== 'admin' || !userId || userId === 'undefined') {
      console.error('handleMarkAttendance: Missing userId or unauthorized');
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === userId && r.date === dateStr);

    try {
      if (existingRecord) {
        await setDoc(doc(db, 'attendance', existingRecord.id), {
          ...existingRecord,
          status,
          markedBy: profile.uid,
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status,
          markedBy: profile.uid,
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const handleSetTime = async (userId: string, type: 'checkIn' | 'checkOut') => {
    if (!profile || profile.role !== 'admin' || !userId || userId === 'undefined') {
      console.error('handleSetTime: Missing userId or unauthorized');
      return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === userId && r.date === dateStr);

    try {
      if (existingRecord) {
        await updateDoc(doc(db, 'attendance', existingRecord.id), {
          [type]: serverTimestamp(),
          status: 'present',
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'attendance'), {
          userId,
          date: dateStr,
          status: 'present',
          markedBy: profile.uid,
          [type]: serverTimestamp(),
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const handleSelfCheck = async (targetUserId?: string) => {
    const uid = targetUserId || user?.uid;
    if (!uid) {
      console.error('handleSelfCheck: No user ID provided');
      return;
    }
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const existingRecord = attendance.find(r => r.userId === uid && r.date === dateStr);

    try {
      if (pinType === 'check-in') {
        if (existingRecord) {
          if (existingRecord.checkIn) return; // Already checked in
          await updateDoc(doc(db, 'attendance', existingRecord.id), {
            checkIn: serverTimestamp(),
            status: 'present',
            timestamp: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'attendance'), {
            userId: uid,
            date: dateStr,
            status: 'present',
            markedBy: profile?.role === 'admin' ? profile.uid : 'self',
            checkIn: serverTimestamp(),
            timestamp: serverTimestamp()
          });
        }
      } else {
        if (!existingRecord) {
          // Allow check-out even if no check-in record exists
          await addDoc(collection(db, 'attendance'), {
            userId: uid,
            date: dateStr,
            status: 'present',
            markedBy: profile?.role === 'admin' ? profile.uid : 'self',
            checkOut: serverTimestamp(),
            timestamp: serverTimestamp()
          });
        } else {
          if (existingRecord.checkOut) return; // Already checked out
          await updateDoc(doc(db, 'attendance', existingRecord.id), {
            checkOut: serverTimestamp(),
            status: 'present',
            timestamp: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const handleSetPin = async (targetUser: UserProfile) => {
    if (!profile || profile.role !== 'admin') return;

    const newPin = window.prompt("Entrez un nouveau code PIN à 4 chiffres pour " + targetUser.displayName);
    if (!newPin) return;

    if (!/^\d{4}$/.test(newPin)) {
      alert("Le code PIN doit comporter exactement 4 chiffres.");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        pin: newPin
      });
      
      // Update local state
      setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, pin: newPin } : u));
      if (selectedUserForConsult?.uid === targetUser.uid) {
        setSelectedUserForConsult({ ...selectedUserForConsult, pin: newPin });
      }
      alert("Code PIN mis à jour avec succès !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${targetUser.uid}`);
    }
  };

  const logout = () => signOut(auth);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const todayRecord = attendance.find(r => r.userId === user.uid && r.date === format(new Date(), 'yyyy-MM-dd'));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg hidden sm:inline">Suivi de Présence</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="font-semibold text-slate-700">{profile?.displayName}</span>
                  <span className="text-xs text-slate-400 capitalize flex items-center gap-1">
                    {profile?.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                    {profile?.role === 'admin' ? 'Administrateur' : 'Employé'}
                  </span>
                </div>
                <img 
                  src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border-2 border-indigo-100"
                  referrerPolicy="no-referrer"
                />
              </div>
              <button 
                onClick={logout}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              {profile?.role === 'user' && (
                <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-indigo-100/50 border border-indigo-50 overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Fingerprint className="w-24 h-24" />
                  </div>
                  <h2 className="font-bold text-lg flex items-center gap-2 mb-6">
                    <Clock className="w-5 h-5 text-indigo-600" />
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
                        Le pointage digital doit être effectué par un administrateur.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Calendar Card */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
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
                              isSelected ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "hover:bg-slate-50",
                              !isSelected && isTodayDate && "text-indigo-600 font-bold ring-2 ring-indigo-100"
                            )}
                          >
                            {format(day, 'd')}
                            {record && !isSelected && (
                              <div className={cn(
                                "absolute bottom-1 w-1 h-1 rounded-full",
                                record.status === 'present' ? "bg-green-500" : "bg-red-500"
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
              {profile?.role !== 'admin' && (
                <div className="space-y-6">
                  <StatsCard 
                    title="Stats Hebdomadaires"
                    periodLabel="Cette semaine"
                    records={attendance.filter(r => {
                      const recordDate = parseISO(r.date);
                      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
                      return r.userId === user.uid && isWithinInterval(recordDate, { start: weekStart, end: weekEnd });
                    })}
                  />
                  <StatsCard 
                    title="Stats Mensuelles"
                    periodLabel={format(currentMonth, 'MMMM yyyy', { locale: fr })}
                    records={attendance.filter(r => 
                      r.userId === user.uid && r.date.startsWith(format(currentMonth, 'yyyy-MM'))
                    )}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Main Content */}
            <div className="lg:col-span-8">
              {profile?.role === 'admin' ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        Marquer la présence
                      </h2>
                      <p className="text-slate-500 text-sm capitalize">Marquage pour {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                    </div>
                    {isToday(selectedDate) && (
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full self-start sm:self-auto uppercase">Aujourd'hui</span>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {allUsers.filter(u => u.role !== 'admin').map((u, index) => {
                      const record = attendance.find(r => r.userId === u.uid && r.date === format(selectedDate, 'yyyy-MM-dd'));
                      
                      return (
                        <div key={u.uid || `user-${index}`} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
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
                                className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:ring-2 group-hover:ring-indigo-400 transition-all"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/0 group-hover:bg-indigo-600/20 rounded-2xl transition-all">
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
                                  className="p-1 hover:bg-slate-200 rounded-md transition-colors text-slate-400 hover:text-indigo-600"
                                  title="Consulter le profil"
                                >
                                  <UserIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="text-xs text-slate-400">{u.email}</div>
                              {record && (record.checkIn || record.checkOut) && (
                                <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-indigo-500 uppercase">
                                  <Clock className="w-3 h-3" />
                                  {record.checkIn ? format(record.checkIn.toDate(), 'HH:mm') : '--'} 
                                  <ArrowRightLeft className="w-2 h-2" />
                                  {record.checkOut ? format(record.checkOut.toDate(), 'HH:mm') : '--'}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1 mr-2">
                              <button 
                                onClick={() => handleMarkAttendance(u.uid, 'present')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  record?.status === 'present' 
                                    ? "bg-green-600 text-white" 
                                    : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600"
                                )}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Présent
                              </button>
                              <button 
                                onClick={() => handleMarkAttendance(u.uid, 'absent')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  record?.status === 'absent' 
                                    ? "bg-red-600 text-white" 
                                    : "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
                                )}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Absent
                              </button>
                            </div>

                            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                              <button 
                                onClick={() => handleSetTime(u.uid, 'checkIn')}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                  record?.checkIn 
                                    ? "bg-indigo-100 text-indigo-700" 
                                    : "bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                )}
                              >
                                <Clock className="w-3 h-3" />
                                {record?.checkIn ? "Arr : " + format(record.checkIn.toDate(), 'HH:mm') : "Arrivée"}
                              </button>
                              <button 
                                onClick={() => handleSetTime(u.uid, 'checkOut')}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                  record?.checkOut 
                                    ? "bg-slate-100 text-slate-700" 
                                    : "bg-slate-50 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                                )}
                              >
                                <Clock className="w-3 h-3" />
                                {record?.checkOut ? "Dép : " + format(record.checkOut.toDate(), 'HH:mm') : "Départ"}
                              </button>
                            </div>
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
                      title="Statistiques Hebdomadaires"
                      periodLabel="Cette semaine"
                      records={attendance.filter(r => {
                        const recordDate = parseISO(r.date);
                        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
                        return isWithinInterval(recordDate, { start: weekStart, end: weekEnd });
                      })}
                    />
                    <AdminStatsGrid 
                      title="Statistiques Mensuelles"
                      periodLabel={format(currentMonth, 'MMMM yyyy', { locale: fr })}
                      records={attendance.filter(r => 
                        r.date.startsWith(format(currentMonth, 'yyyy-MM'))
                      )}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                    <h2 className="text-2xl font-bold mb-6">Votre historique de présence</h2>
                    <div className="space-y-4">
                      {attendance
                        .filter(r => r.userId === user.uid)
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 10)
                        .map(record => (
                          <div key={record.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                record.status === 'present' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                              )}>
                                {record.status === 'present' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                              </div>
                              <div>
                                <div className="font-bold capitalize">{format(parseISO(record.date), 'EEEE d MMMM yyyy', { locale: fr })}</div>
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record.checkIn ? format(record.checkIn.toDate(), 'HH:mm') : 'N/A'}</span>
                                  <ArrowRightLeft className="w-2 h-2" />
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {record.checkOut ? format(record.checkOut.toDate(), 'HH:mm') : 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                            <div className={cn(
                              "px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest",
                              record.status === 'present' ? "bg-green-600 text-white" : "bg-red-600 text-white"
                            )}>
                              {record.status === 'present' ? 'Présent' : 'Absent'}
                            </div>
                          </div>
                        ))}
                      {attendance.filter(r => r.userId === user.uid).length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                          <p>Aucun relevé de présence trouvé pour le moment.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>

        <PinModal 
          isOpen={isPinModalOpen} 
          onClose={() => setIsPinModalOpen(false)} 
          onVerify={handleSelfCheck}
          type={pinType}
          targetProfile={selectedUserForConsult}
        />

        <UserConsultationModal
          isOpen={isConsultModalOpen}
          onClose={() => setIsConsultModalOpen(false)}
          userProfile={selectedUserForConsult}
          attendanceRecords={attendance}
          onSetPin={handleSetPin}
          onPinCheck={(type) => {
            setPinType(type);
            setIsPinModalOpen(true);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
