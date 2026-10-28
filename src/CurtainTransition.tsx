import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CurtainTransitionProps {
  type: 'lang' | 'theme';
  fromLabel: string;
  toLabel: string;
  icon?: string;
  toIcon?: string;
  lang: 'ar' | 'en';
  onApply: () => void;
  onComplete: () => void;
}

const PIXEL_CHARS = ['█', '▓', '▒', '░', '▖', '▗', '▘', '▙', '▚', '▛', '▜', '▝', '▞', '▟', '▰', '▱', '#', '$', '%', '&', '0', '1', 'X', 'Z'];

export function CurtainTransition({
  type,
  fromLabel,
  toLabel,
  icon,
  toIcon,
  lang,
  onApply,
  onComplete
}: CurtainTransitionProps) {
  // Stages: 'closing' -> 'from' -> 'pixelating' -> 'to' -> 'opening' -> 'done'
  const [stage, setStage] = useState<'closing' | 'from' | 'pixelating' | 'to' | 'opening'>('closing');
  const [displayText, setDisplayText] = useState(fromLabel);
  const [displayIcon, setDisplayIcon] = useState(icon || (type === 'lang' ? '🌐' : '☀️'));
  const [isGlitching, setIsGlitching] = useState(false);
  const appliedRef = useRef(false);
  const animIntervalRef = useRef<any>(null);

  function executeApply() {
    if (!appliedRef.current) {
      appliedRef.current = true;
      onApply();
    }
  }

  function handleSkip() {
    if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    executeApply();
    setStage('opening');
    setTimeout(() => {
      onComplete();
    }, 220);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleSkip();
      }
    }
    window.addEventListener('keydown', handleKeyDown);

    // 1. Curtains fully close at ~320ms -> Show initial word
    const tFrom = setTimeout(() => {
      setStage('from');
    }, 320);

    // 2. Start Pixelation / Scramble at ~520ms
    const tPixel = setTimeout(() => {
      setStage('pixelating');
      setIsGlitching(true);

      const maxLen = Math.max(fromLabel.length, toLabel.length);
      let step = 0;
      const totalSteps = 12;

      animIntervalRef.current = setInterval(() => {
        step++;
        const progress = step / totalSteps;

        // Morph character by character
        let scrambled = '';
        const currentLen = Math.round(fromLabel.length + (toLabel.length - fromLabel.length) * progress);

        for (let i = 0; i < currentLen; i++) {
          if (progress > 0.65 && i < Math.floor(toLabel.length * ((progress - 0.65) / 0.35))) {
            scrambled += toLabel[i];
          } else if (Math.random() < 0.4) {
            scrambled += PIXEL_CHARS[Math.floor(Math.random() * PIXEL_CHARS.length)];
          } else if (i < fromLabel.length && progress < 0.4) {
            scrambled += fromLabel[i];
          } else {
            scrambled += PIXEL_CHARS[Math.floor(Math.random() * PIXEL_CHARS.length)];
          }
        }

        setDisplayText(scrambled);

        if (step >= totalSteps) {
          clearInterval(animIntervalRef.current);
        }
      }, 35);
    }, 520);

    // 3. Lock into target word & icon at ~960ms -> apply state change
    const tTo = setTimeout(() => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
      setIsGlitching(false);
      setDisplayText(toLabel);
      if (toIcon) setDisplayIcon(toIcon);
      setStage('to');
      executeApply();
    }, 960);

    // 4. Start opening curtains at ~1250ms
    const tOpen = setTimeout(() => {
      setStage('opening');
    }, 1250);

    // 5. Finished at ~1550ms
    const tFinish = setTimeout(() => {
      onComplete();
    }, 1550);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(tFrom);
      clearTimeout(tPixel);
      clearTimeout(tTo);
      clearTimeout(tOpen);
      clearTimeout(tFinish);
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
  }, [fromLabel, toLabel, toIcon]);

  const isClosed = stage !== 'opening';

  return (
    <div className="curtain-overlay-root" role="dialog" aria-modal="true" aria-label="Screen Transition">
      {/* Top Skip Button */}
      <button
        type="button"
        className="curtain-skip-pill"
        onClick={handleSkip}
        title={lang === 'ar' ? 'تخطي الحركة والانتقال الفوري' : 'Skip transition'}
      >
        <span>{lang === 'ar' ? 'تخطي ✕' : 'Skip ✕'}</span>
      </button>

      {/* Left Shutter / Curtain */}
      <motion.div
        className="curtain-shutter shutter-left"
        initial={{ x: '-100%' }}
        animate={{ x: isClosed ? '0%' : '-100%' }}
        transition={{
          duration: isClosed ? 0.34 : 0.28,
          ease: isClosed ? [0.16, 1, 0.3, 1] : [0.7, 0, 0.84, 0]
        }}
      >
        <div className="shutter-inner-lines" />
        <div className="shutter-seam-edge edge-left" />
      </motion.div>

      {/* Right Shutter / Curtain */}
      <motion.div
        className="curtain-shutter shutter-right"
        initial={{ x: '100%' }}
        animate={{ x: isClosed ? '0%' : '100%' }}
        transition={{
          duration: isClosed ? 0.34 : 0.28,
          ease: isClosed ? [0.16, 1, 0.3, 1] : [0.7, 0, 0.84, 0]
        }}
      >
        <div className="shutter-inner-lines" />
        <div className="shutter-seam-edge edge-right" />
      </motion.div>

      {/* Center Laser Seam Beam (appears when closed) */}
      <motion.div
        className="curtain-center-laser"
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{
          opacity: isClosed && stage !== 'closing' ? [0.4, 0.9, 0.5] : 0,
          scaleY: isClosed ? 1 : 0
        }}
        transition={{ duration: 0.24 }}
      />

      {/* Center Pixelating Stage Card */}
      <AnimatePresence>
        {stage !== 'closing' && stage !== 'opening' && (
          <motion.div
            className={`curtain-center-card ${isGlitching ? 'is-glitching' : ''} stage-${stage}`}
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Ambient Cyber Grid & Glow */}
            <div className="card-cyber-grid" />
            <div className="card-ambient-glow" />

            {/* Type Header Pill */}
            <div className="curtain-type-pill">
              <span className="type-dot" />
              <span>
                {type === 'lang'
                  ? (lang === 'ar' ? 'تبديل اللغة' : 'Language Switch')
                  : (lang === 'ar' ? 'المظهر العام' : 'Theme Mode')}
              </span>
            </div>

            {/* Icon & Morphing Word Container */}
            <div className="curtain-morph-row">
              <span className={`morph-icon ${stage === 'pixelating' ? 'icon-spin' : ''}`}>
                {displayIcon}
              </span>
              <div className="pixel-word-container">
                <span className={`pixel-word-text ${isGlitching ? 'text-pixelating' : ''}`}>
                  {displayText}
                </span>
                {isGlitching && (
                  <span className="pixel-overlay-blocks" aria-hidden="true">
                    ░▒▓
                  </span>
                )}
              </div>
            </div>

            {/* Subtitle Status */}
            <span className="curtain-status-hint">
              {stage === 'to'
                ? (lang === 'ar' ? '✔ تم التفعيل بنجاح' : '✔ Mode Applied')
                : (lang === 'ar' ? '⚡ جارٍ التبديل…' : '⚡ Transforming…')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
