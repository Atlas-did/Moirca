/**
 * 填报入口导航 API
 */
import { get } from './index';
import type { PortalSitesData } from '@/types';

export function fetchAllSites(): Promise<PortalSitesData> {
  return get<PortalSitesData>('/sites/');
}
