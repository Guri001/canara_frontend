import { useState, useMemo } from 'react';
import axios from 'axios';
import { format, isBefore, isAfter, parseISO } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

function App() {
  const [files, setFiles] = useState([]);
  const [data, setData] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    files.forEach(f => {
       formData.append('statements', f);
    });

    try {
      // Swapped to localhost for local testing. Change back to 'https://canara-backend-0v6m.onrender.com/api/upload' when deploying.
      const apiUrl = 'http://localhost:3001/api/upload';
      const res = await axios.post(apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
         setData(res.data.data);
         if (res.data.accountDetails) {
            setAccountInfo(res.data.accountDetails);
         }
      } else {
         setError('Failed to parse document(s)');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred querying the server. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Derive computations based on filters
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(txn => {
      if (txn.type === 'balance') return false; // purely for summary
      const d = parseISO(txn.date);
      if (startDate && isBefore(d, parseISO(startDate))) return false;
      if (endDate && isAfter(d, parseISO(endDate))) return false;
      return true;
    });
  }, [data, startDate, endDate]);

  const summary = useMemo(() => {
    if (!data) return null;
    let totalCredit = 0;
    let totalDebit = 0;

    filteredData.forEach(t => {
      if (t.type === 'credit') totalCredit += (t.amount || 0);
      else if (t.type === 'debit') totalDebit += (t.amount || 0);
    });

    const net = totalCredit - totalDebit;

    // determine opening/closing using true chronological ledger running balance
    let systemOpening = 0;
    
    // Globally sort all valid transactions mathematically
    const globalSorted = data.filter(t => t.type !== 'balance').sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (globalSorted.length > 0) {
         // The undisputed system opening balance is the first transaction's balance conceptually fully reversed
         const globalFirst = globalSorted[0];
         systemOpening = globalFirst.type === 'credit' ? globalFirst.balance - globalFirst.amount : globalFirst.balance + globalFirst.amount;
    }
    
    let relativeOpening = systemOpening;
    let relativeClosing = systemOpening;

    if (filteredData.length > 0) {
        // Since filteredData is derived chronologically, the absolute anchor of the view is the last displayed transaction 
        relativeClosing = filteredData[filteredData.length - 1].balance;
        
        // Reverse calculation dynamically fixes visual windows starting mid-statement 
        const firstViewTxn = filteredData[0];
        relativeOpening = firstViewTxn.type === 'credit' ? firstViewTxn.balance - firstViewTxn.amount : firstViewTxn.balance + firstViewTxn.amount;
    } else if (startDate && globalSorted.length > 0) {
        // Blank view space fallback
        const start = parseISO(startDate);
        const beforeTxns = globalSorted.filter(t => isBefore(new Date(t.date), start));
        if (beforeTxns.length > 0) {
           relativeOpening = beforeTxns[beforeTxns.length - 1].balance;
           relativeClosing = relativeOpening;
        }
    }

    return { totalCredit, totalDebit, net, relativeOpening, relativeClosing };
  }, [data, filteredData, startDate, endDate]);

  const chartData = useMemo(() => {
     if (!filteredData.length) return [];
     const groups = {};
     filteredData.forEach(t => {
        const month = format(parseISO(t.date), 'MMM yyyy');
        if (!groups[month]) groups[month] = { month, credit: 0, debit: 0 };
        if (t.type === 'credit') groups[month].credit += t.amount;
        if (t.type === 'debit') groups[month].debit += t.amount;
     });
     return Object.values(groups);
  }, [filteredData]);

  const exportCSV = () => {
    if (!filteredData || filteredData.length === 0) return;
    const headers = ['Date', 'Description', 'Type', 'Amount', 'Balance'];
    const rows = filteredData.map(txn => {
        return [
          txn.date ? format(parseISO(txn.date), 'dd MMM yyyy') : '',
          `"${(txn.description || '').replace(/"/g, '""')}"`, // escape quotes
          txn.type,
          txn.amount || '',
          txn.balance || ''
        ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "bank_statement_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="loading">Processing Strategy Protocol...</div>;

  return (
    <div className="app-container">
      <h1 className="title">Finance Hub</h1>
      <p className="subtitle">
        Canara Bank AI Parser <span style={{ marginLeft: '0.75rem', fontStyle: 'italic', fontSize: '0.9rem' }}>— Made with ❤️ by Gurvinder</span>
      </p>
      
      {!data ? (
        <div 
          className="glass-panel upload-container"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileUpload').click()}
        >
           <input 
             type="file" 
             id="fileUpload" 
             accept="application/pdf"
             multiple
             style={{ display: 'none' }} 
             onChange={handleFileSelect} 
           />
           <h2>{files.length > 0 ? `${files.length} statement(s) ready` : 'Drop your Canara Bank PDF chunks here'}</h2>
           <p style={{ color: 'var(--text-muted)' }}>You can upload multiple PDFs at once</p>
           {files.length > 0 && (
             <div style={{ marginTop: '1rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
               {files.map((f, i) => <div key={i}>{f.name}</div>)}
             </div>
           )}
           {files.length > 0 && (
             <button className="upload-btn" onClick={(e) => { e.stopPropagation(); uploadFiles(); }}>
               Analyze Statements
             </button>
           )}
           {error && <p style={{ color: 'var(--debit-color)', marginTop: '1rem' }}>{error}</p>}
        </div>
      ) : (
        <>
          <div className="glass-panel" style={{ marginBottom: '2rem' }}>
              <div className="filters">
                <div className="filter-group">
                  <label>Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="action-buttons" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', marginLeft: 'auto' }}>
                  <button 
                    className="upload-btn" 
                    style={{ background: 'var(--accent-purple)' }} 
                    onClick={() => window.print()}
                  >
                    Export PDF
                  </button>
                  <button 
                    className="upload-btn" 
                    style={{ background: 'var(--credit-color)' }} 
                    onClick={exportCSV}
                  >
                    Export CSV
                  </button>
                  <button 
                    className="upload-btn" 
                    onClick={() => { setData(null); setAccountInfo(null); }}
                  >
                    Upload New
                  </button>
                </div>
             </div>
          </div>

          {accountInfo && (
             <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'var(--accent-blue)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.1rem' }}>Account Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                   <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Name</p>
                       <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: 'var(--text-main)' }}>{accountInfo.name || 'N/A'}</p>
                   </div>
                   <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Number</p>
                       <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: 'var(--text-main)' }}>{accountInfo.accountNo || 'N/A'}</p>
                   </div>
                   <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branch</p>
                       <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: 'var(--text-main)' }}>{accountInfo.branch || 'N/A'}</p>
                   </div>
                   <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IFSC</p>
                       <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: 'var(--text-main)' }}>{accountInfo.ifsc || 'N/A'}</p>
                   </div>
                </div>
             </div>
          )}

          {summary && (
            <div className="summary-grid">
               <div className="glass-panel summary-card">
                  <p>Opening Balance</p>
                  <h2>₹{summary.relativeOpening.toLocaleString('en-IN', {minimumFractionDigits: 2})}</h2>
               </div>
               <div className="glass-panel summary-card">
                  <p>Total Credit</p>
                  <h2 className="credit-val">₹{summary.totalCredit.toLocaleString('en-IN', {minimumFractionDigits: 2})}</h2>
               </div>
               <div className="glass-panel summary-card">
                  <p>Total Debit</p>
                  <h2 className="debit-val">₹{summary.totalDebit.toLocaleString('en-IN', {minimumFractionDigits: 2})}</h2>
               </div>
               <div className="glass-panel summary-card">
                  <p>Closing Balance</p>
                  <h2>₹{summary.relativeClosing.toLocaleString('en-IN', {minimumFractionDigits: 2})}</h2>
               </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="glass-panel" style={{ marginBottom: '2rem', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-muted)" />
                  <YAxis stroke="var(--text-muted)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: 'var(--text-main)' }}
                  />
                  <Legend />
                  <Bar dataKey="credit" fill="var(--credit-color)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debit" fill="var(--debit-color)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glass-panel table-wrapper">
             <table>
                <thead>
                   <tr>
                      <th>Date</th>
                      <th>Description / Particulars</th>
                      <th style={{textAlign: 'right'}}>Credit (₹)</th>
                      <th style={{textAlign: 'right'}}>Debit (₹)</th>
                      <th style={{textAlign: 'right'}}>Balance (₹)</th>
                   </tr>
                </thead>
                <tbody>
                   {filteredData.map((txn, idx) => (
                      <tr key={idx}>
                         <td className="date-cell">{format(parseISO(txn.date), 'dd MMM yyyy')}</td>
                         <td className="description-cell">{txn.description}</td>
                         <td style={{textAlign: 'right'}} className="credit-val">
                           {txn.type === 'credit' ? txn.amount.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '-'}
                         </td>
                         <td style={{textAlign: 'right'}} className="debit-val">
                           {txn.type === 'debit' ? txn.amount.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '-'}
                         </td>
                         <td style={{textAlign: 'right'}}>
                           {txn.balance ? txn.balance.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '-'}
                         </td>
                      </tr>
                   ))}
                   {filteredData.length === 0 && (
                     <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                           No transactions found for the selected dates.
                        </td>
                     </tr>
                   )}
                </tbody>
             </table>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
