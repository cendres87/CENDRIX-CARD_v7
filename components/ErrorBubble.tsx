import React from 'react';
import { ValidationError } from '../types';

interface ErrorBubbleProps {
  error?: ValidationError | null;
}

export const ErrorBubble: React.FC<ErrorBubbleProps> = ({ error }) => {
  if (!error) return null;
  return (
    <div className="group absolute top-1/2 -right-3 -translate-y-1/2 z-10">
      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg animate-pulse">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
        <p className="font-bold text-red-400 text-sm">{error.message}</p>
        <p className="text-xs text-slate-400 mt-1">{error.suggestion}</p>
        <div className="absolute top-full right-3 border-8 border-transparent border-t-slate-600"></div>
      </div>
    </div>
  );
};
