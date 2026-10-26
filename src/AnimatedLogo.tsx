import React from 'react';
import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  animateOnMount?: boolean;
  interactiveHover?: boolean;
  onClick?: () => void;
}

export function AnimatedLogo({
  className = '',
  width = '100%',
  height = 'auto',
  animateOnMount = false,
  interactiveHover = true,
  onClick
}: AnimatedLogoProps) {
  return (
    <motion.svg
      className={`titan-brand-svg ${className}`}
      width={width}
      height={height}
      viewBox="0 0 300 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      whileHover={interactiveHover ? { scale: 1.03 } : undefined}
      whileTap={interactiveHover ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.2 }}
    >
      <defs>
        <filter id="nav-box-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#f58220" floodOpacity="0.4" />
        </filter>
        <filter id="nav-i-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f58220" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* 1. Shelves / Rack Posts */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M10 16 L10 93"
          stroke="currentColor"
          className="rack-beam"
          initial={animateOnMount ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        <motion.path
          d="M58 16 L58 93"
          stroke="currentColor"
          className="rack-beam"
          initial={animateOnMount ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        />
        <motion.path
          d="M10 91 L58 91"
          stroke="currentColor"
          className="rack-beam"
          initial={animateOnMount ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}
        />
        <motion.path
          d="M10 69 L58 69"
          stroke="currentColor"
          className="rack-beam"
          initial={animateOnMount ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.25, ease: 'easeOut' }}
        />
        <motion.path
          d="M10 43 L58 43"
          stroke="currentColor"
          className="rack-beam"
          initial={animateOnMount ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
        />
      </g>

      {/* 2. Orange Boxes */}
      <g fill="#f58220" filter="url(#nav-box-glow)">
        <motion.rect
          x="16"
          y="23"
          width="16"
          height="17"
          rx="2"
          initial={animateOnMount ? { y: -20, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.35 }}
        />
        <motion.rect
          x="36"
          y="26"
          width="16"
          height="14"
          rx="2"
          initial={animateOnMount ? { y: -20, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.42 }}
        />
        <motion.rect
          x="16"
          y="48"
          width="35"
          height="18"
          rx="2"
          initial={animateOnMount ? { y: -20, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.49 }}
        />
        <motion.rect
          x="16"
          y="74"
          width="16"
          height="14"
          rx="2"
          initial={animateOnMount ? { y: -15, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.56 }}
        />
      </g>

      {/* 3. Text: TITAN */}
      <motion.text
        x="70"
        y="65"
        fontFamily="Arial, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="57"
        fill="currentColor"
        direction="ltr"
        textAnchor="start"
        className="brand-text-titan"
        initial={animateOnMount ? { opacity: 0, x: -10 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        T
        <tspan fill="#f58220" filter="url(#nav-i-glow)">
          I
        </tspan>
        TAN
      </motion.text>

      {/* 4. Text: INVENTORY */}
      <motion.text
        x="73"
        y="91"
        fontFamily="Arial, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="21"
        letterSpacing="3"
        fill="#354650"
        direction="ltr"
        textAnchor="start"
        className="brand-text-inventory"
        initial={animateOnMount ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        INVENTORY
      </motion.text>
    </motion.svg>
  );
}
