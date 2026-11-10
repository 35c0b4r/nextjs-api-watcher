import { useState } from 'react';
import type { EndpointStats } from '../core/types';
import { formatMs } from '../core/utils';
import { Method } from './shared';

type SortKey = 'count' | 'errors' | 'avg' | 'lastSeen' | 'pathname';

interface Props {
  endpoints: EndpointStats[];
  onSelect: (key: string) => void;
}

export function EndpointTable({ endpoints, onSelect }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'count', desc: true });

  if (!endpoints.length) {
    return (
      <div className="empty">
        <b>No API calls recorded yet</b>
        Every endpoint called during this session (until a full page reload) is listed here with its call count.
      </div>
    );
  }

  const avg = (e: EndpointStats) => (e.completed ? e.totalDuration / e.completed : 0);
  const value = (e: EndpointStats): number | string =>
    sort.key === 'avg' ? avg(e) : sort.key === 'pathname' ? e.pathname : e[sort.key];
  const sorted = [...endpoints].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return sort.desc ? -cmp : cmp;
  });

  const header = (key: SortKey, label: string, className = '') => (
    <th
      className={className}
      style={{ cursor: 'pointer' }}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'pathname' }))}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
    </th>
  );

  return (
    <table>
      <colgroup>
        <col style={{ width: 64 }} />
        <col />
        <col style={{ width: 70 }} />
        <col style={{ width: 64 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 150 }} />
        <col style={{ width: 80 }} />
      </colgroup>
      <thead>
        <tr>
          <th>Method</th>
          {header('pathname', 'Endpoint')}
          {header('count', 'Calls', 'num')}
          {header('errors', 'Errors', 'num')}
          {header('avg', 'Avg time', 'num')}
          <th>Last status</th>
          <th>Called from</th>
          {header('lastSeen', 'Last call', 'num')}
        </tr>
      </thead>
      <tbody>
        {sorted.map((e) => (
          <tr key={e.key} onClick={() => onSelect(e.key)} title={`${e.method} ${e.origin}${e.pathname}`}>
            <td>
              <Method method={e.method} />
            </td>
            <td className="name">
              <span className="path">{e.pathname}</span>
              {e.kind === 'server' ? (
                <span className="pill server">server</span>
              ) : (
                e.isNextInternal && <span className="pill">next</span>
              )}
              {e.origin !== location.origin && <span className="host">{e.origin}</span>}
            </td>
            <td className="num">
              <span className="count-pill">{e.count}</span>
            </td>
            <td className={`num ${e.errors ? 's-err' : 'muted'}`}>{e.errors}</td>
            <td className="num">{e.completed ? formatMs(avg(e)) : '—'}</td>
            <td className={`status s-${e.lastStatus ? String(e.lastStatus)[0] : 'pending'}`}>
              {e.lastStatus ?? (e.pending ? '(pending)' : '—')}
            </td>
            <td className="mono muted" title={e.pages.join('\n')}>
              {e.pages.length === 1 ? e.pages[0] : `${e.pages.length} pages`}
            </td>
            <td className="num muted">{new Date(e.lastSeen).toLocaleTimeString([], { hour12: false })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
