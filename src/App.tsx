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
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO } from 'date-fns';
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
}

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent';
  markedBy: string;
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
          <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload Application
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
      <p className="text-slate-600 font-medium">Loading Attendance Tracker...</p>
    </motion.div>
  </div>
);

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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Attendance Tracker</h1>
        <p className="text-slate-500 mb-8">Sign in to manage or view your attendance records.</p>
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-200 active:scale-[0.98]"
        >
          <LogIn className="w-5 h-5" />
          Sign in with Google
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // Create default profile
            const isDefaultAdmin = currentUser.email === 'daniel.shofela01@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Anonymous',
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
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
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
    if (!profile || profile.role !== 'admin') return;

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

  const logout = () => signOut(auth);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

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
              <span className="font-bold text-lg hidden sm:inline">Attendance Tracker</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="font-semibold text-slate-700">{profile?.displayName}</span>
                  <span className="text-xs text-slate-400 capitalize flex items-center gap-1">
                    {profile?.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                    {profile?.role}
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
                title="Sign Out"
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
              {/* Calendar Card */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
                    Calendar
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="text-center mb-4 font-semibold text-slate-600">
                  {format(currentMonth, 'MMMM yyyy')}
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {eachDayOfInterval({
                    start: startOfMonth(currentMonth),
                    end: endOfMonth(currentMonth)
                  }).map(day => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);
                    const record = attendance.find(r => r.userId === (profile?.role === 'admin' ? selectedDate.toString() : user.uid) && r.date === format(day, 'yyyy-MM-dd'));
                    
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
              </div>

              {/* Stats Card */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <h2 className="font-bold text-lg flex items-center gap-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  Monthly Stats
                </h2>
                
                {(() => {
                  const monthRecords = attendance.filter(r => 
                    r.date.startsWith(format(currentMonth, 'yyyy-MM')) &&
                    (profile?.role === 'admin' ? true : r.userId === user.uid)
                  );
                  const presentCount = monthRecords.filter(r => r.status === 'present').length;
                  const absentCount = monthRecords.filter(r => r.status === 'absent').length;
                  const total = presentCount + absentCount;
                  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border border-green-100">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="text-green-700 font-medium">Present</span>
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
                        <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Attendance Rate</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Right Column: Main Content */}
            <div className="lg:col-span-8">
              {profile?.role === 'admin' ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        Mark Attendance
                      </h2>
                      <p className="text-slate-500 text-sm">Marking for {format(selectedDate, 'EEEE, MMMM do, yyyy')}</p>
                    </div>
                    {isToday(selectedDate) && (
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full self-start sm:self-auto">TODAY</span>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {allUsers.filter(u => u.role !== 'admin').map(u => {
                      const record = attendance.find(r => r.userId === u.uid && r.date === format(selectedDate, 'yyyy-MM-dd'));
                      
                      return (
                        <div key={u.uid} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <img 
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} 
                              alt={u.displayName} 
                              className="w-12 h-12 rounded-2xl bg-slate-100"
                            />
                            <div>
                              <div className="font-bold text-slate-800">{u.displayName}</div>
                              <div className="text-xs text-slate-400">{u.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleMarkAttendance(u.uid, 'present')}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all",
                                record?.status === 'present' 
                                  ? "bg-green-600 text-white shadow-md shadow-green-100" 
                                  : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600"
                              )}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="hidden sm:inline">Present</span>
                            </button>
                            <button 
                              onClick={() => handleMarkAttendance(u.uid, 'absent')}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all",
                                record?.status === 'absent' 
                                  ? "bg-red-600 text-white shadow-md shadow-red-100" 
                                  : "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
                              )}
                            >
                              <XCircle className="w-4 h-4" />
                              <span className="hidden sm:inline">Absent</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {allUsers.filter(u => u.role !== 'admin').length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>No users found in the system.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                    <h2 className="text-2xl font-bold mb-6">Your Attendance History</h2>
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
                                <div className="font-bold">{format(parseISO(record.date), 'MMMM do, yyyy')}</div>
                                <div className="text-xs text-slate-400">Marked at {format(record.timestamp.toDate(), 'HH:mm')}</div>
                              </div>
                            </div>
                            <div className={cn(
                              "px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest",
                              record.status === 'present' ? "bg-green-600 text-white" : "bg-red-600 text-white"
                            )}>
                              {record.status}
                            </div>
                          </div>
                        ))}
                      {attendance.filter(r => r.userId === user.uid).length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                          <p>No attendance records found yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
