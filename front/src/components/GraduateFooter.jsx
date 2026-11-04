import React from 'react';
import HelpFooter from './HelpFooter';
import { CEREMONY_TITLE } from '../config/brand';
import '../style/GraduateFooter.css';

export const COMMITTEE_LINE = 'لجنة تنظيم وتنسيق حفلات التخرج المركزية';

/*
 * The bottom of every graduate page, always the same three lines:
 * the help question with the WhatsApp number, the ceremony name, the committee.
 */
export default function GraduateFooter({ phone }) {
  return (
    <footer className="gf">
      <HelpFooter phone={phone} />
      <p className="gf-title">{CEREMONY_TITLE}</p>
      <p className="gf-sub">{COMMITTEE_LINE}</p>
    </footer>
  );
}
