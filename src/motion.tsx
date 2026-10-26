import React from 'react';
import { motion, MotionProps } from 'framer-motion';

/**
 * Standard stagger delay calculation with smooth upward hover animation:
 * Delays each item progressively so they appear one after another smoothly,
 * and on hover glides smoothly upwards.
 * 
 * @param index - Index in the .map() loop (0, 1, 2, ...)
 * @param stagger - Delay step per item (default: 0.05s)
 * @param duration - Transition duration (default: 0.28s)
 * @param hoverY - Upward hover distance in px (default: -3.5px)
 */
export function staggerItem(index: number, stagger = 0.05, duration = 0.28, hoverY = -3.5): MotionProps {
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    whileHover: hoverY ? {
      y: hoverY,
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
    } : undefined,
    transition: {
      duration,
      delay: Math.min(index * stagger, 1.2),
      ease: [0.22, 1, 0.36, 1]
    }
  };
}

/**
 * Scale + Fade variant for cards and badges with smooth upward hover lift
 */
export function staggerScaleItem(index: number, stagger = 0.04, duration = 0.28, hoverY = -6): MotionProps {
  return {
    initial: { opacity: 0, scale: 0.96, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    whileHover: {
      y: hoverY,
      scale: 1.018,
      transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
    },
    whileTap: {
      scale: 0.985,
      y: 0
    },
    transition: {
      duration,
      delay: Math.min(index * stagger, 1.0),
      ease: [0.22, 1, 0.36, 1]
    }
  };
}

/**
 * Reusable smooth upward lift for any hoverable component
 */
export function hoverLift(hoverY = -4, duration = 0.2): MotionProps {
  return {
    whileHover: {
      y: hoverY,
      transition: { duration, ease: [0.22, 1, 0.36, 1] }
    }
  };
}

export const MotionTr = motion.tr;
export const MotionButton = motion.button;
export const MotionDiv = motion.div;
export const MotionLi = motion.li;
export const MotionArticle = motion.article;
export const MotionSection = motion.section;
