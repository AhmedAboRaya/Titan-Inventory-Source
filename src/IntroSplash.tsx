import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface IntroSplashProps {
  onComplete: () => void;
  lang?: 'ar' | 'en';
}

export function IntroSplash({ onComplete, lang = 'ar' }: IntroSplashProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Total intro runtime is ~2.0s, exit transition begins at 1.95s
    const exitTimer = setTimeout(() => {
      setExiting(true);
    }, 1950);

    // Call onComplete after exit transition finishes
    const finishTimer = setTimeout(() => {
      onComplete();
    }, 2250);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  function handleSkip() {
    setExiting(true);
    setTimeout(onComplete, 180);
  }

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="intro-splash-overlay"
          dir="ltr"
          style={{ direction: 'ltr' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Ambient Blueprint Grid & Glow */}
          <div className="intro-bg-glow" />
          <div className="intro-bg-grid" />

          {/* Top Skip Button */}
          <button
            type="button"
            className="intro-skip-btn"
            onClick={handleSkip}
            title={lang === 'ar' ? 'تخطي الشاشة الترحيبية' : 'Skip intro'}
          >
            <span>{lang === 'ar' ? 'تخطي' : 'Skip'}</span>
            <span className="skip-arrow">➔</span>
          </button>

          {/* Main Stage */}
          <div className="intro-center-stage">
            <div className="intro-logo-wrapper">
              <svg
                className="intro-logo-svg"
                viewBox="0 0 300 112"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                dir="ltr"
                style={{ direction: 'ltr' }}
              >
                <defs>
                  {/* Subtle Box Glow Filter */}
                  <filter id="intro-box-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#f58220" floodOpacity="0.45" />
                  </filter>
                  {/* Intense Glowing I Filter */}
                  <filter id="intro-i-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f58220" floodOpacity="0.95" />
                  </filter>
                  {/* Polished Metallic Beam Gradient */}
                  <linearGradient id="intro-steel-beam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e2ecf1" />
                    <stop offset="50%" stopColor="#92abb8" />
                    <stop offset="100%" stopColor="#55707e" />
                  </linearGradient>
                </defs>

                {/* ========================================================
                    1. SHELF / RACK FRAMEWORK (Clearly Visible Metallic Beams)
                    ======================================================== */}
                <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  {/* Left Upright Beam */}
                  <motion.path
                    d="M10 16 L10 93"
                    stroke="url(#intro-steel-beam)"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.05, ease: 'easeInOut' }}
                  />

                  {/* Right Upright Beam */}
                  <motion.path
                    d="M58 16 L58 93"
                    stroke="url(#intro-steel-beam)"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.12, ease: 'easeInOut' }}
                  />

                  {/* Top Shelf Beam */}
                  <motion.path
                    d="M10 43 L58 43"
                    stroke="#94adb9"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.22, ease: 'easeOut' }}
                  />

                  {/* Middle Shelf Beam */}
                  <motion.path
                    d="M10 69 L58 69"
                    stroke="#94adb9"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.28, ease: 'easeOut' }}
                  />

                  {/* Base Shelf Beam */}
                  <motion.path
                    d="M10 91 L58 91"
                    stroke="#94adb9"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.34, ease: 'easeOut' }}
                  />
                </g>

                {/* ========================================================
                    2. ORANGE INVENTORY BOXES (Drop with spring onto shelves)
                    ======================================================== */}
                <g fill="#f58220" filter="url(#intro-box-glow)">
                  {/* Box 1: Top Left */}
                  <motion.rect
                    x="16"
                    y="23"
                    width="16"
                    height="17"
                    rx="2.5"
                    initial={{ y: -30, opacity: 0, scale: 0.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 16,
                      delay: 0.38
                    }}
                  />

                  {/* Box 2: Top Right */}
                  <motion.rect
                    x="36"
                    y="26"
                    width="16"
                    height="14"
                    rx="2.5"
                    initial={{ y: -30, opacity: 0, scale: 0.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 16,
                      delay: 0.46
                    }}
                  />

                  {/* Box 3: Middle Wide Box */}
                  <motion.rect
                    x="16"
                    y="48"
                    width="35"
                    height="18"
                    rx="2.5"
                    initial={{ y: -30, opacity: 0, scale: 0.7 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 17,
                      delay: 0.54
                    }}
                  />

                  {/* Box 4: Bottom Box */}
                  <motion.rect
                    x="16"
                    y="74"
                    width="16"
                    height="14"
                    rx="2.5"
                    initial={{ y: -25, opacity: 0, scale: 0.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 16,
                      delay: 0.62
                    }}
                  />
                </g>

                {/* ========================================================
                    3. TYPOGRAPHY "TITAN" (Slide & Fade Reveal from Left)
                    ======================================================== */}
                <motion.g
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <text
                    x="70"
                    y="65"
                    fontFamily="Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                    fontWeight="900"
                    fontSize="57"
                    fill="#ffffff"
                    direction="ltr"
                    textAnchor="start"
                    xmlSpace="preserve"
                  >
                    T<tspan fill="#f58220" filter="url(#intro-i-glow)">I</tspan>TAN
                  </text>
                </motion.g>

                {/* ========================================================
                    4. SUBTITLE "INVENTORY" (Glides up with expanded tracking)
                    ======================================================== */}
                <motion.text
                  x="73"
                  y="91"
                  fontFamily="Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                  fontWeight="700"
                  fontSize="21"
                  letterSpacing="3.5"
                  fill="#9cb5c2"
                  direction="ltr"
                  textAnchor="start"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.72, ease: [0.16, 1, 0.3, 1] }}
                >
                  INVENTORY
                </motion.text>
              </svg>
            </div>

            {/* Industrial Progress Bar & Centered Status Text */}
            <div className="intro-meta-center">
              <div className="intro-progress-track">
                <motion.div
                  className="intro-progress-bar"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.05, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <motion.div
                className="intro-status-text"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75, duration: 0.35 }}
              >
                <span className="dot-pulse" />
                <span>
                  {lang === 'ar'
                    ? 'كل قطعة في مكانها · جاري تجهيز بيئة العمل…'
                    : 'Every part in place · Preparing workspace…'}
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
