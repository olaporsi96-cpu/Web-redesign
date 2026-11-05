'use client';

export default function PrintButton() {
  return (
    <button type="button" className="result-button result-button-primary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
