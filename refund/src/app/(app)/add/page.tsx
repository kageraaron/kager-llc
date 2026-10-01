import { AddForm } from '@/components/Controls';

export default function AddPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Add a purchase</h1>
        <div className="sub">Bought in a store, or an email Refund couldn’t read</div>
      </header>
      <AddForm />
    </main>
  );
}
