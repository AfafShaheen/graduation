import React from 'react';
import '../style/PageSkeleton.css';

// Grey placeholders in the shape of a page (header, tabs, two cards) while the data loads.
// A screen reader hears the text; the shimmer stops for people who asked for less motion.
export default function PageSkeleton({ label = 'جارٍ التحميل...' }) {
  return (
    <div className="skel" role="status" aria-live="polite">
      <span className="skel-sr">{label}</span>
      <div className="skel-header" aria-hidden="true" />
      <div className="skel-body" aria-hidden="true">
        <div className="skel-tabs" />
        <div className="skel-card tall" />
        <div className="skel-card" />
        <div className="skel-line" />
        <div className="skel-line short" />
      </div>
    </div>
  );
}
