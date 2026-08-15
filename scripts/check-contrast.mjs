const hex=(h)=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=(r)=>0.2126*lin(r[0])+0.7152*lin(r[1])+0.0722*lin(r[2]);
const over=(fg,a,bg)=>fg.map((c,i)=>c*a+bg[i]*(1-a));
const R=(a,b)=>{const l1=L(a),l2=L(b);const[h,l]=l1>l2?[l1,l2]:[l2,l1];return (h+0.05)/(l+0.05);};
const W=hex('#ffffff'), SHELL=hex('#1a4599');
const CARD=over(W,0.08,SHELL), INPUT=over(W,0.1,CARD), NAV=over(hex('#0a2470'),0.9,SHELL);
const rows=[
 ['white on card',W,CARD],['white on shell',W,SHELL],
 ['ink-soft 82% on card',over(W,0.82,CARD),CARD],
 ['ink-soft 82% on shell',over(W,0.82,SHELL),SHELL],
 ['ink-faint 72% on card',over(W,0.72,CARD),CARD],
 ['placeholder 83% on input',over(W,0.83,INPUT),INPUT],
 ['nav inactive 60% on nav',over(W,0.6,NAV),NAV],
 ['button ink on orange',hex('#1c1c1e'),hex('#f5900a')],
 ['button ink on orange-strong',hex('#1c1c1e'),hex('#e07d00')],
 ['primary-text on card',hex('#fac37b'),CARD],
 ['danger-text on card',hex('#ffbbbb'),CARD],
 ['success-text on card',hex('#55efc4'),CARD],
 ['resident-text on card',hex('#a9d1fd'),CARD],
 ['warning-text on card',hex('#fac37b'),CARD],
 ['drawer link white on #0a2470',W,hex('#0a2470')],
 ['modal text on #0e2a63',W,hex('#0e2a63')],
 ['modal soft 82% on #0e2a63',over(W,0.82,hex('#0e2a63')),hex('#0e2a63')],
];
let bad=[];
for(const [n,a,b] of rows){const r=R(a,b);if(r<4.5)bad.push(`${n} = ${r.toFixed(2)}`);console.log((r>=4.5?'AA  ':'FAIL'),r.toFixed(2).padStart(6),n);}
console.log(bad.length?'\nFAILING:\n'+bad.join('\n'):'\nAll pairs clear 4.5:1');
