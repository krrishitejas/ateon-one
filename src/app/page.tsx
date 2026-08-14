'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, KeyRound, ArrowRight, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';

type LoginStep = 'credentials' | 'otp' | 'verifying';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.push('/dashboard');
  }, [isAuthenticated, router]);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setIsLoading(true);
    
    try {
      const res = await login(email, password);
      
      if (res?.requireOtp) {
        setStep('otp');
      } else if (res?.success) {
        router.push('/dashboard');
      } else {
        setError(res?.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'A network or server error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    // Auto-focus next
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setStep('verifying');
    setError('');

    const res = await login(email, password, code);
    if (res.success) {
      router.push('/dashboard');
    } else {
      setError(res.error || 'Invalid OTP');
      setStep('otp');
    }
  };

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[440px]"
      >
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image src="/logo.png" alt="ATEON Labs" width={200} height={200} priority style={{ objectFit: 'contain', width: '200px', maxHeight: '200px', height: 'auto' }} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <AnimatePresence mode="wait">
            {step === 'credentials' && (
              <motion.div key="cred" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="text-center mb-8">
                  <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
                  <p className="text-sm text-gray-500 mt-1">Enter your credentials to continue</p>
                </div>

                <form onSubmit={handleCredentialSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@ateonlabs.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-600">{error}</p>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-full text-sm font-medium hover:bg-black transition-colors disabled:opacity-50 cursor-pointer mt-2"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <><span>Continue</span><ArrowRight size={14} /></>}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="text-center mb-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <KeyRound size={22} className="text-gray-600" />
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">Verification</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Enter the 6-digit code sent to<br />
                    <span className="font-medium text-gray-700">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-6">
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(i, e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="w-11 h-12 text-center text-lg font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  {error && <p className="text-xs text-red-600 text-center">{error}</p>}

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-full text-sm font-medium hover:bg-black transition-colors cursor-pointer"
                  >
                    Verify & Sign In
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setStep('credentials'); setOtp(['', '', '', '', '', '']); setError(''); }}
                      className="text-xs text-gray-500 hover:text-gray-900 cursor-pointer"
                    >
                      ← Back to login
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 'verifying' && (
              <motion.div key="verify" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-10 h-10 border-2 border-gray-200 border-t-gray-900 rounded-full mx-auto"
                />
                <p className="text-sm text-gray-600 mt-4">Verifying your identity...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          © {new Date().getFullYear()} ATEON Labs. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
