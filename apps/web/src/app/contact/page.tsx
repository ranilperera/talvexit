import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with the TalvexIT team. Enterprise enquiries, partnership proposals, or general questions — we\'re here to help.',
};

export default function ContactPage() {
  return <ContactClient />;
}
