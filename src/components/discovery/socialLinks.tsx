import React from 'react';
import {
  Globe,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  MessageCircle,
  Link2,
  ExternalLink,
} from 'lucide-react';
import type { DiscoverySocialPlatform, DiscoverySocialLink } from '../../types/discovery';

export interface SocialPlatformConfig {
  id: DiscoverySocialPlatform;
  label: string;
  placeholder: string;
  defaultDomain: string;
  badgeBg: string;
  badgeText: string;
  brandColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SOCIAL_PLATFORMS: SocialPlatformConfig[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    placeholder: 'https://facebook.com/yourbusiness',
    defaultDomain: 'facebook.com',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    brandColor: '#1877F2',
    icon: Facebook,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/yourhandle',
    defaultDomain: 'instagram.com',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60',
    badgeText: 'text-rose-700 dark:text-rose-300',
    brandColor: '#E1306C',
    icon: Instagram,
  },
  {
    id: 'website',
    label: 'Official Website',
    placeholder: 'https://yourbusiness.sl',
    defaultDomain: '',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    brandColor: '#4F46E5',
    icon: Globe,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@yourbusiness',
    defaultDomain: 'tiktok.com',
    badgeBg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-800 dark:text-slate-200',
    brandColor: '#000000',
    icon: Globe,
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    placeholder: 'https://x.com/yourhandle',
    defaultDomain: 'x.com',
    badgeBg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-800 dark:text-slate-200',
    brandColor: '#0F1419',
    icon: Twitter,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Channel',
    placeholder: 'https://whatsapp.com/channel/...',
    defaultDomain: 'whatsapp.com',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    brandColor: '#25D366',
    icon: MessageCircle,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/company/yourbusiness',
    defaultDomain: 'linkedin.com',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/60',
    badgeText: 'text-sky-700 dark:text-sky-300',
    brandColor: '#0A66C2',
    icon: Linkedin,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    placeholder: 'https://youtube.com/@yourchannel',
    defaultDomain: 'youtube.com',
    badgeBg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60',
    badgeText: 'text-red-700 dark:text-red-300',
    brandColor: '#FF0000',
    icon: Youtube,
  },
  {
    id: 'other',
    label: 'Web Link',
    placeholder: 'https://...',
    defaultDomain: '',
    badgeBg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    badgeText: 'text-slate-700 dark:text-slate-300',
    brandColor: '#64748B',
    icon: Link2,
  },
];

export function getSocialPlatformConfig(platform?: string): SocialPlatformConfig {
  const found = SOCIAL_PLATFORMS.find((p) => p.id === platform);
  return found || SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];
}

export function detectSocialPlatform(url: string): DiscoverySocialPlatform {
  const lower = url.toLowerCase();
  if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me')) return 'facebook';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'x';
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('whatsapp.com') || lower.includes('wa.me')) return 'whatsapp';
  return 'website';
}

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
