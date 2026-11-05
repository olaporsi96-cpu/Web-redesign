'use client';

import { useState } from 'react';

const slides = [
  {
    title: 'Welcome to Adebola College',
    description: 'A private coeducational school offering Junior and Senior Secondary education and distance learning.',
  },
  {
    title: 'Focused on excellence, We Nurture Talents.',
    description: 'Helping every child discover and develop their unique gifts',
  },
  {
    title: 'The right path to top universities.',
    description: 'Opening doors to global opportunities for our students',
  },
  {
    title: 'Shaping future leaders.',
    description: 'Equipping young minds with knowledge, values, and vision',
  },
  {
    title: 'With Adebola College E-Learning offering,',
    description: 'you learn on your terms, at your own pace. Anytime, anywhere: your classroom has no walls.',
  },
];

export default function HomeSpotlight() {
  const [activeIndex, setActiveIndex] = useState(0);
  const slide = slides[activeIndex];

  function moveBy(offset) {
    setActiveIndex((current) => (current + offset + slides.length) % slides.length);
  }

  return (
    <div className="home-spotlight" aria-live="polite">
      <h1 key={slide.title}>{slide.title}</h1>
      <p>{slide.description}</p>
      <div className="spotlight-controls" aria-label="Homepage messages">
        <button type="button" aria-label="Previous message" onClick={() => moveBy(-1)}>←</button>
        <div className="spotlight-dots">
          {slides.map((item, index) => (
            <button
              type="button"
              key={item.title}
              className={index === activeIndex ? 'is-active' : ''}
              aria-label={`Show message: ${item.title}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
        <button type="button" aria-label="Next message" onClick={() => moveBy(1)}>→</button>
      </div>
    </div>
  );
}
