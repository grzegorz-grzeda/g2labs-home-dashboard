import React from 'react';

export default function PageIntro({ eyebrow, title, description, actions, stats = [] }) {
  return (
    <section className="page-intro">
      <div className="page-intro-main">
        {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
        <h2 className="page-title">{title}</h2>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-intro-actions">{actions}</div> : null}
      {stats.length > 0 ? (
        <div className="stat-strip">
          {stats.map(stat => (
            <div key={stat.label} className="stat-card">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              {stat.note ? <div className="stat-note">{stat.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
