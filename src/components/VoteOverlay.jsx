import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function VoteOverlay() {
  const { battle, voteRemaining, reducedMotion } = useAppContext();
  if (!battle) return null;

  const isVoteStage =
    battle.stage === 'vote1' ||
    battle.stage === 'vote2' ||
    battle.stage === 'overtime';

  if (!isVoteStage) return null;

  const now = Date.now();
  const msRemaining = Math.max(0, voteRemaining || (battle.voteEndsAt ? battle.voteEndsAt - now : 0));

  // Compute total window duration dynamically based on when this window started.
  // Fallback to 10_000 if we can’t infer it (keeps UI robust).
  const stageStartedAt = battle.stageStartedAt || (now - msRemaining);
  const totalWindowMs = Math.max(1000, (battle.voteEndsAt || now) - stageStartedAt || 10_000);

  const seconds = Math.ceil(msRemaining / 1000);
  const progress = Math.min(1, Math.max(0, 1 - msRemaining / totalWindowMs));
  const votesA = battle.voteTotals?.a || 0;
  const votesB = battle.voteTotals?.b || 0;

  const label =
    battle.stage === 'overtime'
      ? 'Overtime'
      : battle.stage === 'vote2'
      ? 'Final Vote'
      : 'Round Vote';

  const ringDash = useMemo(() => {
    const circumference = 2 * Math.PI * 54;
    return {
      strokeDasharray: circumference,
      strokeDashoffset: circumference * (1 - progress)
    };
  }, [progress]);

  return (
    <div className="vote-overlay" aria-live="polite" aria-label="Voting window">
      <div className="vote-panel">
        <div className="vote-header">
          <span className="vote-phase">{label}</span>
          <span className="vote-instruction">Type in chat: !vote A or !vote B</span>
        </div>
        <div className="vote-countdown">
          <div className={`ring-wrapper ${reducedMotion ? 'no-motion' : ''}`}>
            <svg viewBox="0 0 120 120" className="vote-ring">
              <defs>
                <linearGradient id="gradRing" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7af0a3" />
                  <stop offset="50%" stopColor="#7fd8ff" />
                  <stop offset="100%" stopColor="#ff95e5" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="54" className="vote-ring-bg" />
              <circle cx="60" cy="60" r="54" className="vote-ring-fg" style={ringDash} />
              <text x="60" y="66" textAnchor="middle" className="vote-ring-text">
                {seconds}
              </text>
            </svg>
            <div className="ring-glow" />
          </div>
          <div className="vote-totals">
            <div className="vote-side">
              <div className="vote-label">A</div>
              <div className="vote-value">{votesA}</div>
            </div>
            <div className="vote-side">
              <div className="vote-label">B</div>
              <div className="vote-value">{votesB}</div>
            </div>
          </div>
        </div>
        <div className="vote-footer">
          {battle.stage === 'vote2' || battle.stage === 'overtime'
            ? 'Winner announced after this vote.'
            : 'Playback resumes after voting.'}
        </div>
      </div>
    </div>
  );
}