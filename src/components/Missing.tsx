import { Link } from 'react-router-dom';
import { Phone } from './Layouts';
import { Header, TopBar } from './ui';

export function Missing({ title, sub = 'Mục này có thể đã bị xóa hoặc chưa đồng bộ tới máy này.', back, label, simple }: { title: string; sub?: string; back: string; label: string; simple?: boolean }) {
  return (
    <Phone tabs simple={simple}>
      <TopBar back backTo={back} />
      <Header title={title} sub={sub} />
      <Link to={back} className="btn">{label}</Link>
    </Phone>
  );
}
