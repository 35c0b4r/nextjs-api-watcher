import type { ApiRecord } from '../core/types';
import { formatBytes, formatMs } from '../core/utils';
import { KindPill, Method, Name, isFailed, responseSize, statusClass, statusLabel, typeLabel } from './shared';

interface Props {
  records: ApiRecord[];
  selectedId?: number;
  onSelect: (id: number) => void;
  narrow: boolean;
  showPage?: boolean;
}

export function RequestTable({ records, selectedId, onSelect, narrow, showPage }: Props) {
  if (!records.length) {
    return (
      <div className="empty">
        <b>No requests yet</b>
        fetch() and XMLHttpRequest calls will show up here as they happen.
      </div>
    );
  }

  return (
    <table>
      <colgroup>
        <col />
        {!narrow && (
          <>
            <col style={{ width: 64 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 120 }} />
            {showPage && <col style={{ width: 130 }} />}
            <col style={{ width: 72 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 78 }} />
          </>
        )}
        {narrow && <col style={{ width: 70 }} />}
      </colgroup>
      <thead>
        <tr>
          <th>Name</th>
          {!narrow && (
            <>
              <th>Method</th>
              <th>Status</th>
              <th>Type</th>
              {showPage && <th>Page</th>}
              <th className="num">Size</th>
              <th className="num">Time</th>
              <th className="num">Started</th>
            </>
          )}
          {narrow && <th>Status</th>}
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr
            key={r.id}
            className={`${r.id === selectedId ? 'selected' : ''} ${isFailed(r) ? 'failed' : ''}`}
            onClick={() => onSelect(r.id)}
            title={r.url}
          >
            <td className="name">
              {narrow && (
                <>
                  <Method method={r.method} />{' '}
                </>
              )}
              <Name r={r} showHost={!narrow} />
              <KindPill r={r} />
            </td>
            {!narrow && (
              <>
                <td>
                  <Method method={r.method} />
                </td>
                <td className={`status ${statusClass(r)}`}>{statusLabel(r)}</td>
                <td className="muted">{typeLabel(r)}</td>
                {showPage && <td className="mono muted">{r.pagePath}</td>}
                <td className="num">{formatBytes(responseSize(r))}</td>
                <td className="num">{r.state === 'pending' ? <span className="s-pending">…</span> : formatMs(r.duration)}</td>
                <td className="num muted">{new Date(r.startedAt).toLocaleTimeString([], { hour12: false })}</td>
              </>
            )}
            {narrow && <td className={`status ${statusClass(r)}`}>{statusLabel(r)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
