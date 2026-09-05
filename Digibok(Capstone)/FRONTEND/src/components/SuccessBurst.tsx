import { motion, AnimatePresence } from "motion/react";
import { ThumbsUp } from "lucide-react";
import { useEffect } from "react";

interface SuccessBurstProps {
  show: boolean;
  message: string;
  onDone: () => void;
  durationMs?: number;
}

// A brief, tasteful "done!" toast for the moment a piece of work actually closes out —
// a payment getting confirmed (which is also the instant its tax/permit obligation
// flips to filed/renewed) or a balanced journal entry landing in the ledger. Not used
// for routine saves — only for the handful of actions that represent completed work.
export default function SuccessBurst({ show, message, onDone, durationMs = 2200 }: SuccessBurstProps) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [show, durationMs, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: -8 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 pl-3.5 pr-5 py-3 bg-green-600 rounded-2xl shadow-2xl shadow-green-500/30 border border-green-400/40"
        >
          <motion.div
            initial={{ rotate: -20, scale: 0.4 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 420, damping: 12 }}
            className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0"
          >
            <ThumbsUp className="w-4 h-4 text-white" fill="white" />
          </motion.div>
          <span className="text-sm font-bold text-white leading-tight">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
