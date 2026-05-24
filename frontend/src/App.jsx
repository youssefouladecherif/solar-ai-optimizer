import { useState, useEffect, useCallback } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts })
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`)
  return r.json()
}

const soilingColor = (pct) => {
  if (pct < 12) return "#16A34A"
  if (pct < 20) return "#C97A06"
  if (pct < 35) return "#C2410C"
  return "#C81E1E"
}

function describeArc(cx, cy, r, startA, endA) {
  const x1=cx+Math.cos(startA)*r, y1=cy+Math.sin(startA)*r
  const x2=cx+Math.cos(endA)*r,   y2=cy+Math.sin(endA)*r
  return `M ${x1} ${y1} A ${r} ${r} 0 ${endA-startA>Math.PI?1:0} 1 ${x2} ${y2}`
}

function SoilingGauge({ pct=25.7, alert="ALERTE" }) {
  const cx=110,cy=100,R=78,sa=Math.PI*0.78,ea=Math.PI*2.22
  const va=sa+(ea-sa)*Math.min(pct/40,1)
  const col=soilingColor(pct)
  return (
    <svg width="220" height="155">
      <path d={describeArc(cx,cy,R,sa,ea)} fill="none" stroke="rgba(20,49,31,0.08)" strokeWidth="15" strokeLinecap="round"/>
      <path d={describeArc(cx,cy,R,sa,va)} fill="none" stroke={col} strokeWidth="15" strokeLinecap="round"/>
      <circle cx={cx+Math.cos(va)*R} cy={cy+Math.sin(va)*R} r="7" fill={col}/>
      <circle cx={cx+Math.cos(va)*R} cy={cy+Math.sin(va)*R} r="3" fill="#fff"/>
      <text x={cx} y={cy-8}  textAnchor="middle" fontSize="28" fontWeight="700" fill="#162716">{pct}%</text>
      <text x={cx} y={cy+10} textAnchor="middle" fontSize="12" fontWeight="600" fill={col}>{alert}</text>
      <text x={cx} y={cy+26} textAnchor="middle" fontSize="11" fill="rgba(22,39,22,0.42)">Soiling Index</text>
    </svg>
  )
}

function Metric({ label, value, sub, color }) {
  return (
    <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:9,padding:"12px 14px"}}>
      <div style={{fontSize:10.5,textTransform:"uppercase",letterSpacing:"0.05em",color:"#7DA882",marginBottom:3}}>{label}</div>
      <div style={{fontSize:21,fontWeight:700,color:color||"#162716",lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#7DA882",marginTop:2}}>{sub}</div>}
    </div>
  )
}

function Pill({ text, type="gr" }) {
  const s={gr:{bg:"rgba(22,163,74,0.11)",color:"#15803D"},am:{bg:"rgba(201,122,6,0.11)",color:"#92400E"},or:{bg:"rgba(194,65,12,0.11)",color:"#9A3412"},rd:{bg:"rgba(200,30,30,0.11)",color:"#991B1B"}}[type]||{bg:"rgba(22,163,74,0.11)",color:"#15803D"}
  return <span style={{display:"inline-flex",alignItems:"center",padding:"2.5px 9px",borderRadius:20,fontSize:11,fontWeight:600,background:s.bg,color:s.color}}>{text}</span>
}

function RoiBar({ accumulated, target }) {
  return (
    <div>
      <div style={{height:5,background:"rgba(201,122,6,0.12)",borderRadius:3,overflow:"hidden",marginTop:8}}>
        <div style={{height:"100%",width:`${Math.min((accumulated/target)*100,100)}%`,background:"#C97A06",borderRadius:3}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,color:"#92400E",marginTop:3}}>
        <span>{Math.round(accumulated)} DH accumulés</span><span>{Math.round(target)} DH seuil</span>
      </div>
    </div>
  )
}

// ── CLIENT DASHBOARD
function ClientDashboard({ data, loading, onContactPartner }) {
  if (loading) return <div style={{padding:40,textAlign:"center",color:"#7DA882"}}>Chargement des données...</div>
  if (!data)   return <div style={{padding:40,textAlign:"center",color:"#7DA882"}}>Aucune donnée disponible</div>
  const p=data.prediction, w=data.weather
  const roiType={ATTENDRE:"am",PLANIFIER:"gr",URGENT:"or",CRITIQUE:"rd"}[p.alerte_nettoyage]||"am"
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <h1 style={{fontSize:20,fontWeight:700,color:"#162716"}}>Tableau de bord</h1>
        <div style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"0.5px solid rgba(20,49,31,0.17)",borderRadius:7,padding:"5px 11px",fontSize:11.5,color:"#3D6145"}}>
          <span style={{width:6,height:6,background:"#16A34A",borderRadius:"50%",display:"inline-block"}}></span>
          EN DIRECT · {new Date().toLocaleTimeString("fr-FR")}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[{icon:"🌿",label:"CO₂ évité",val:`${Math.round((w?.irradiation_kwh_m2||0)*0.43)} kg`},{icon:"☀️",label:"Production",val:`${p.p_theoretical_kwh} kWh/j`},{icon:"💰",label:"Économies",val:`${Math.round((p.p_real_kwh||p.p_theoretical_kwh*(1-p.soiling_final))*1.2*30)} DH/mois`}].map(item=>(
          <div key={item.label} style={{flex:1,display:"flex",alignItems:"center",gap:6,background:"#fff",border:"0.5px solid rgba(22,163,74,0.22)",borderRadius:8,padding:"7px 11px",fontSize:12}}>
            <span>{item.icon}</span><span style={{color:"#3D6145"}}>{item.label}: </span><strong style={{color:"#16A34A"}}>{item.val}</strong>
          </div>
        ))}
      </div>
      {p.alert_soiling!=="NORMAL"&&(
        <div style={{display:"flex",alignItems:"center",gap:12,background:"rgba(200,30,30,0.07)",border:"0.5px solid rgba(200,30,30,0.22)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
          <div style={{width:34,height:34,background:"rgba(200,30,30,0.13)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:"#C81E1E",fontSize:18,flexShrink:0}}>⚠</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13.5,color:"#C81E1E",marginBottom:2}}>Encrassement {p.soiling_pct}% · {p.alert_soiling}</div>
            <div style={{fontSize:12,color:"#7F1D1D"}}>{p.rentable?`Nettoyage recommandé`:`Rentable dans ${Math.round(p.jours_restants)} jours`} · Perte: {p.perte_dh_jour} DH/j</div>
          </div>
          <button onClick={onContactPartner} style={{background:"#16A34A",color:"#fff",border:"none",padding:"7px 14px",borderRadius:7,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Contacter</button>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:"18px 14px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:10,alignSelf:"flex-start"}}>Indice de propreté (IA)</div>
          <SoilingGauge pct={p.soiling_pct} alert={p.alert_soiling}/>
          <div style={{marginTop:11,paddingTop:11,borderTop:"0.5px solid rgba(20,49,31,0.09)",width:"100%",display:"grid",gridTemplateColumns:"repeat(3,1fr)",textAlign:"center",gap:4}}>
            <div><div style={{fontSize:10,color:"#7DA882"}}>M1</div><div style={{fontWeight:700,fontSize:13}}>{(p.soiling_m1_calcul*100).toFixed(1)}%</div></div>
            <div><div style={{fontSize:10,color:"#7DA882"}}>M2 IA</div><div style={{fontWeight:700,fontSize:13}}>{(p.soiling_m2_ia*100).toFixed(1)}%</div></div>
            <div><div style={{fontSize:10,color:"#7DA882"}}>Confiance</div><div style={{fontWeight:700,fontSize:13,color:"#16A34A"}}>{p.confidence_pct}%</div></div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
            <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:10}}>Production aujourd'hui</div>
            <div style={{display:"flex",alignItems:"baseline",gap:5,marginBottom:7}}>
              <span style={{fontSize:26,fontWeight:700,color:"#162716"}}>{p.p_real_kwh||(p.p_theoretical_kwh*(1-p.soiling_final)).toFixed(1)}</span>
              <span style={{color:"#7DA882",fontSize:12}}>/ {p.p_theoretical_kwh} kWh théorique</span>
            </div>
            <div style={{height:5,background:"rgba(20,49,31,0.08)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(p.power_ratio*100).toFixed(0)}%`,background:"#C97A06",borderRadius:3}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11}}>
              <span style={{color:"#7DA882"}}>Power ratio: {(p.power_ratio*100).toFixed(1)}%</span>
              <span style={{color:"#C81E1E"}}>-{p.perte_kwh_jour} kWh perdus</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <Metric label="Perte / jour" value={`${p.perte_dh_jour} DH`} sub={`${p.perte_kwh_jour} kWh`} color="#C81E1E"/>
            <Metric label="Perte cumulée" value={`${Math.round(p.perte_cumulee_dh)} DH`} sub={`${data.features?.days_since_last_cleaning||0} jours`} color="#C97A06"/>
          </div>
          <div style={{background:"#FFFBEB",border:"0.5px solid rgba(201,122,6,0.22)",borderRadius:10,padding:15}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
              <span style={{fontSize:12,fontWeight:700,color:"#C97A06"}}>💰 ROI Nettoyage</span>
              <Pill text={p.alerte_nettoyage} type={roiType}/>
            </div>
            <div style={{fontSize:22,fontWeight:700,color:"#162716"}}>{p.rentable?"Nettoyez maintenant !": `${Math.round(p.jours_restants)} jours restants`}</div>
            <RoiBar accumulated={p.perte_cumulee_dh} target={p.cout_nettoyage_dh}/>
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        <Metric label="Jours sans pluie" value={`${data.features?.days_since_last_rain||0} j`}/>
        <Metric label="Irradiation" value={`${(w?.irradiation_kwh_m2||0).toFixed(2)} kWh/m²`}/>
        <Metric label="Température" value={`${(w?.temp_air_c||0).toFixed(1)}°C`}/>
        <Metric label="Vent" value={`${(w?.wind_speed_ms||0).toFixed(1)} m/s`}/>
      </div>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:10}}>Diagnostic IA</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🤖</span>
          <div>
            <div style={{fontWeight:600,color:"#162716",marginBottom:2}}>{p.diagnostic}</div>
            <div style={{fontSize:12,color:"#3D6145"}}>Écart M1/M2: {(p.gap_m1_m2*100).toFixed(1)}% · Confiance: {p.confidence_pct}%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ANALYSES
function AnalysesPage({ data }) {
  const p=data?.prediction, w=data?.weather
  const trend=[
    {jour:"J-30",soiling:8.2,prod:51.2},{jour:"J-25",soiling:10.1,prod:50.1},
    {jour:"J-20",soiling:14.3,prod:47.8},{jour:"J-15",soiling:18.7,prod:45.2},
    {jour:"J-10",soiling:22.4,prod:42.1},{jour:"J-5",soiling:24.8,prod:40.5},
    {jour:"Auj.",soiling:p?.soiling_pct||25.7,prod:parseFloat(p?.p_real_kwh||39.2)},
  ]
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>Analyses & Tendances</h1>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:12}}>Évolution Soiling Index (30 jours)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,49,31,0.06)"/>
              <XAxis dataKey="jour" tick={{fontSize:10,fill:"#7DA882"}}/>
              <YAxis tick={{fontSize:10,fill:"#7DA882"}} unit="%"/>
              <Tooltip formatter={(v)=>[`${v}%`,"Soiling"]} contentStyle={{fontSize:11,borderRadius:7}}/>
              <Line type="monotone" dataKey="soiling" stroke="#C97A06" strokeWidth={2} dot={{r:3,fill:"#C97A06"}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:12}}>Production réelle (kWh/j)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,49,31,0.06)"/>
              <XAxis dataKey="jour" tick={{fontSize:10,fill:"#7DA882"}}/>
              <YAxis tick={{fontSize:10,fill:"#7DA882"}}/>
              <Tooltip contentStyle={{fontSize:11,borderRadius:7}}/>
              <Bar dataKey="prod" name="Production (kWh)" fill="#16A34A" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:10}}>🌤️ Météo du jour</div>
          {[{icon:"☀️",label:"Irradiation",val:`${(w?.irradiation_kwh_m2||6.82).toFixed(2)} kWh/m²`},{icon:"🌡️",label:"Température",val:`${(w?.temp_air_c||22.4).toFixed(1)}°C`},{icon:"💧",label:"Humidité",val:`${(w?.humidity_pct||62).toFixed(0)}%`},{icon:"🌬️",label:"Vent",val:`${(w?.wind_speed_ms||3.8).toFixed(1)} m/s`},{icon:"🌧️",label:"Précip.",val:`${(w?.precipitation_mm||0.3).toFixed(1)} mm`}].map(r=>(
            <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid rgba(20,49,31,0.05)",fontSize:12}}>
              <span style={{color:"#3D6145"}}>{r.icon} {r.label}</span>
              <span style={{fontWeight:600,color:"#162716"}}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:10}}>🤖 Performance IA</div>
          {[{label:"M1 (physique)",val:`${p?(p.soiling_m1_calcul*100).toFixed(1):"--"}%`},{label:"M2 (IA MLP)",val:`${p?(p.soiling_m2_ia*100).toFixed(1):"--"}%`},{label:"Hybride final",val:`${p?p.soiling_pct:"--"}%`},{label:"Confiance",val:`${p?p.confidence_pct:"--"}%`},{label:"Diagnostic",val:p?.diagnostic||"--"}].map(r=>(
            <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid rgba(20,49,31,0.05)",fontSize:11,gap:8}}>
              <span style={{color:"#3D6145"}}>{r.label}</span>
              <span style={{fontWeight:600,color:"#162716",textAlign:"right"}}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:10}}>📅 Bilan mensuel</div>
          {[{label:"Prod. théorique",val:`${p?Math.round(p.p_theoretical_kwh*30):"--"} kWh`},{label:"Prod. réelle",val:`${p?Math.round((p.p_real_kwh||p.p_theoretical_kwh*(1-p.soiling_final))*30):"--"} kWh`},{label:"Perte totale",val:`${p?Math.round(p.perte_kwh_jour*30):"--"} kWh`,color:"#C81E1E"},{label:"Perte financière",val:`${p?Math.round(p.perte_dh_jour*30):"--"} DH`,color:"#C81E1E"},{label:"Économies",val:`${p?Math.round(p.p_theoretical_kwh*(1-p.soiling_final)*1.2*30):"--"} DH`,color:"#16A34A"}].map(r=>(
            <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid rgba(20,49,31,0.05)",fontSize:11}}>
              <span style={{color:"#3D6145"}}>{r.label}</span>
              <span style={{fontWeight:600,color:r.color||"#162716"}}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ALERTES
function AlertesPage({ data }) {
  const p=data?.prediction, alertLevel=p?.alert_soiling||"ALERTE"
  const alertColor={NORMAL:"#16A34A",AVERTISSEMENT:"#C97A06",ALERTE:"#C2410C",CRITIQUE:"#C81E1E"}[alertLevel]||"#C2410C"
  const typeMap={NORMAL:"gr",AVERTISSEMENT:"am",ALERTE:"or",CRITIQUE:"rd"}
  const historique=[
    {date:"2026-04-15",niveau:"CRITIQUE",soiling:38.2,action:"Nettoyage effectué ✓"},
    {date:"2026-03-20",niveau:"ALERTE",soiling:29.1,action:"Nettoyage effectué ✓"},
    {date:"2026-02-10",niveau:"AVERTISSEMENT",soiling:17.5,action:"Surveillance"},
    {date:"2026-01-05",niveau:"ALERTE",soiling:24.8,action:"Nettoyage effectué ✓"},
    {date:"2025-12-01",niveau:"NORMAL",soiling:9.2,action:"RAS"},
  ]
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>Alertes & Notifications</h1>
      <div style={{background:`${alertColor}11`,border:`0.5px solid ${alertColor}44`,borderRadius:12,padding:"18px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <div style={{width:48,height:48,background:`${alertColor}22`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
          {alertLevel==="NORMAL"?"✅":alertLevel==="AVERTISSEMENT"?"⚠️":"🚨"}
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:16,color:alertColor,marginBottom:4}}>Alerte active : {alertLevel}</div>
          <div style={{fontSize:13,color:"#3D6145"}}>Soiling: <strong>{p?.soiling_pct||25.7}%</strong> · Perte: <strong>{p?.perte_dh_jour||16.38} DH/j</strong></div>
          <div style={{fontSize:12,color:"#7DA882",marginTop:4}}>{alertLevel==="NORMAL"?"Aucune action requise.":alertLevel==="AVERTISSEMENT"?"Surveiller l'évolution.":"Nettoyage recommandé."}</div>
        </div>
        <Pill text={alertLevel} type={typeMap[alertLevel]||"or"}/>
      </div>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16,marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:12}}>Seuils d'alerte</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[{label:"NORMAL",range:"0–12%",color:"#16A34A",bg:"#DCFCE7"},{label:"AVERTISSEMENT",range:"12–20%",color:"#C97A06",bg:"#FEF9C3"},{label:"ALERTE",range:"20–35%",color:"#C2410C",bg:"#FFEDD5"},{label:"CRITIQUE",range:">35%",color:"#C81E1E",bg:"#FEE2E2"}].map(s=>(
            <div key={s.label} style={{background:alertLevel===s.label?s.bg:"#F9FBF9",border:`1.5px solid ${alertLevel===s.label?s.color:"rgba(20,49,31,0.08)"}`,borderRadius:9,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:s.color,marginBottom:3}}>{s.label}</div>
              <div style={{fontSize:12,color:"#162716",fontWeight:600}}>{s.range}</div>
              {alertLevel===s.label&&<div style={{fontSize:9.5,color:s.color,marginTop:4,fontWeight:600}}>← ACTUEL</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:12}}>Historique des alertes</div>
        {historique.map((h,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#F9FBF9",borderRadius:8,border:"0.5px solid rgba(20,49,31,0.07)",marginBottom:6}}>
            <div style={{fontSize:11,color:"#7DA882",width:78,flexShrink:0}}>{h.date}</div>
            <Pill text={h.niveau} type={typeMap[h.niveau]||"gr"}/>
            <div style={{fontSize:12,color:"#162716",flex:1}}>Soiling: <strong>{h.soiling}%</strong></div>
            <div style={{fontSize:11.5,color:h.action.includes("✓")?"#16A34A":"#7DA882"}}>{h.action}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── REGLAGES CLIENT
function ReglagesClientPage() {
  const [saved,setSaved]=useState(false)
  const [form,setForm]=useState({station:"BOUSF_001",lat:"33.40",lon:"-7.55",capacity:"10",cout:"800",tarif:"1.20",fusionUser:"Optimizer-api",fusionCode:""})
  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>Réglages de la station</h1>
      {saved&&<div style={{background:"#F0FDF4",border:"0.5px solid rgba(22,163,74,0.3)",borderRadius:9,padding:"10px 14px",marginBottom:16,color:"#16A34A",fontSize:13,fontWeight:600}}>✅ Paramètres sauvegardés !</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:18}}>
          <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:14}}>📍 Configuration station</div>
          {[{label:"Code station",key:"station",type:"text",ph:"BOUSF_001"},{label:"Latitude",key:"lat",type:"number",ph:"33.40"},{label:"Longitude",key:"lon",type:"number",ph:"-7.55"},{label:"Capacité (kWp)",key:"capacity",type:"number",ph:"10"}].map(f=>(
            <div key={f.key} style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#7DA882",marginBottom:4}}>{f.label}</div>
              <input type={f.type} value={form[f.key]} onChange={e=>set(f.key,e.target.value)} placeholder={f.ph} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#F2F7F2",color:"#162716",fontSize:12.5}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:18}}>
            <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:14}}>💰 Paramètres financiers</div>
            {[{label:"Coût nettoyage (DH)",key:"cout",ph:"800"},{label:"Tarif ONEE (DH/kWh)",key:"tarif",ph:"1.20"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:"#7DA882",marginBottom:4}}>{f.label}</div>
                <input type="number" value={form[f.key]} onChange={e=>set(f.key,e.target.value)} placeholder={f.ph} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#F2F7F2",color:"#162716",fontSize:12.5}}/>
              </div>
            ))}
          </div>
          <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:18}}>
            <div style={{fontSize:13,fontWeight:700,color:"#162716",marginBottom:4}}>🌐 FusionSolar</div>
            <div style={{fontSize:11,color:"#7DA882",marginBottom:12}}>Pour activer les données réelles</div>
            {[{label:"Utilisateur",key:"fusionUser",ph:"Optimizer-api"},{label:"System Code",key:"fusionCode",ph:"votre_code"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:"#7DA882",marginBottom:4}}>{f.label}</div>
                <input type="text" value={form[f.key]} onChange={e=>set(f.key,e.target.value)} placeholder={f.ph} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#F2F7F2",color:"#162716",fontSize:12.5}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      <button onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),3000)}} style={{marginTop:16,width:"100%",background:"#16A34A",color:"#fff",border:"none",padding:12,borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>💾 Sauvegarder</button>
    </div>
  )
}

// ── PARTNERS PAGE
function PartnersPage({ prediction, onBack }) {
  const [partners,setPartners]=useState([])
  const [selected,setSelected]=useState(null)
  const [sent,setSent]=useState(false)
  const [date,setDate]=useState("")
  const [note,setNote]=useState("")
  useEffect(()=>{
    apiFetch("/api/partners?lat=33.57&lon=-7.59").then(d=>setPartners(d.partners)).catch(()=>setPartners([
      {id:1,name:"SolarClean Maroc",city:"Casablanca",rating:4.8,reviews:142,tarif_kwp_30:800,availability:"demain",distance_km:3.2},
      {id:2,name:"CleanSolar Pro",city:"Mohammédia",rating:4.6,reviews:89,tarif_kwp_30:800,availability:"dans 3 jours",distance_km:18},
      {id:3,name:"EcoPanel Services",city:"Rabat",rating:4.9,reviews:217,tarif_kwp_30:800,availability:"dans 5 jours",distance_km:92},
    ]))
  },[])
  const sendRequest=async()=>{
    try{await apiFetch(`/api/cleaning-request?partner_id=${selected}&station_code=BOUSF_001&client_name=Ahmed+Benali&soiling_pct=${prediction?.soiling_pct||25.7}&requested_date=${date}&note=${note}`,{method:"POST"})}catch(_){}
    setSent(true)
  }
  if(sent) return (
    <div style={{textAlign:"center",padding:"40px 20px"}}>
      <div style={{fontSize:48,marginBottom:12}}>✅</div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>Demande envoyée !</div>
      <div style={{fontSize:12.5,color:"#3D6145"}}>Confirmation sous 2h.</div>
      <button onClick={onBack} style={{marginTop:16,background:"#16A34A",color:"#fff",border:"none",padding:"9px 20px",borderRadius:7,cursor:"pointer",fontWeight:600}}>Retour</button>
    </div>
  )
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <h1 style={{fontSize:20,fontWeight:700,color:"#162716"}}>Demande de nettoyage</h1>
        <button onClick={onBack} style={{padding:"7px 14px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#fff",color:"#162716",cursor:"pointer"}}>← Retour</button>
      </div>
      {prediction&&<div style={{background:"#F0FDF4",border:"0.5px solid rgba(22,163,74,0.22)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12.5,color:"#3D6145"}}>☀ Station Bousfifa · Soiling {prediction.soiling_pct}%</div>}
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
        {partners.map(p=>(
          <div key={p.id} onClick={()=>setSelected(p.id)} style={{background:selected===p.id?"#F0FDF4":"#fff",border:selected===p.id?"1.5px solid #16A34A":"0.5px solid rgba(20,49,31,0.09)",borderRadius:10,padding:14,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:42,height:42,borderRadius:9,background:"#F0FDF4",border:"0.5px solid rgba(22,163,74,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>🏪</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13.5,color:"#162716"}}>{p.name}</div>
                <div style={{fontSize:11.5,color:"#7DA882"}}>{p.city} · {p.distance_km} km · ★ {p.rating}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:700,color:"#C97A06",fontSize:14}}>{p.tarif_kwp_30} DH</div>
                <div style={{fontSize:11,color:p.availability==="demain"?"#16A34A":"#7DA882"}}>{p.availability}</div>
              </div>
              {selected===p.id&&<span style={{fontSize:20,color:"#16A34A"}}>✓</span>}
            </div>
          </div>
        ))}
      </div>
      {selected&&(
        <div>
          <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16,marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><div style={{fontSize:11,color:"#7DA882",marginBottom:4}}>Date souhaitée</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#F2F7F2",color:"#162716",fontSize:12.5}}/></div>
            <div><div style={{fontSize:11,color:"#7DA882",marginBottom:4}}>Note</div><input type="text" placeholder="Note..." value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"0.5px solid rgba(20,49,31,0.17)",background:"#F2F7F2",color:"#162716",fontSize:12.5}}/></div>
          </div>
          <button onClick={sendRequest} style={{width:"100%",background:"#16A34A",color:"#fff",border:"none",padding:11,borderRadius:7,fontSize:13.5,fontWeight:600,cursor:"pointer"}}>📤 Envoyer la demande</button>
        </div>
      )}
    </div>
  )
}

// ── ADMIN OVERVIEW
function AdminOverview() {
  const stations=[
    {code:"BOUSF_001",site:"Bousfifa",client:"Ahmed Benali",soiling:25.7,alert:"ALERTE",prod:39.2},
    {code:"CASA_002",site:"Casablanca",client:"Karim Idrissi",soiling:11.2,alert:"NORMAL",prod:52.1},
    {code:"RABAT_003",site:"Rabat",client:"Sara Alami",soiling:18.9,alert:"AVERTISSEMENT",prod:44.7},
    {code:"MARRA_004",site:"Marrakech",client:"Omar Tazi",soiling:36.1,alert:"CRITIQUE",prod:31.2},
    {code:"FES_005",site:"Fès",client:"Leila Fassi",soiling:7.4,alert:"NORMAL",prod:55.3},
  ]
  const typeMap={NORMAL:"gr",AVERTISSEMENT:"am",ALERTE:"or",CRITIQUE:"rd"}
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>Vue globale — Admin</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <Metric label="Stations actives" value={`${stations.length}`} sub="toutes en ligne"/>
        <Metric label="Critiques" value={`${stations.filter(s=>s.alert==="CRITIQUE").length}`} sub="action requise" color="#C81E1E"/>
        <Metric label="Alertes" value={`${stations.filter(s=>s.alert==="ALERTE").length}`} sub="à surveiller" color="#C2410C"/>
        <Metric label="Production totale" value={`${stations.reduce((a,s)=>a+s.prod,0).toFixed(0)} kWh`} sub="aujourd'hui"/>
      </div>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7DA882",marginBottom:12}}>Toutes les stations</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5}}>
          <thead><tr style={{borderBottom:"0.5px solid rgba(20,49,31,0.1)"}}>
            {["Station","Site","Client","Soiling","Alerte","Production"].map(h=>(
              <th key={h} style={{textAlign:"left",padding:"6px 8px",fontSize:10,fontWeight:600,color:"#7DA882",textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {stations.map((s,i)=>(
              <tr key={s.code} style={{borderBottom:"0.5px solid rgba(20,49,31,0.06)",background:i%2===0?"#fff":"#FAFCFA"}}>
                <td style={{padding:"9px 8px",fontWeight:600,color:"#162716",fontFamily:"monospace",fontSize:11}}>{s.code}</td>
                <td style={{padding:"9px 8px",color:"#3D6145"}}>{s.site}</td>
                <td style={{padding:"9px 8px",color:"#162716"}}>{s.client}</td>
                <td style={{padding:"9px 8px",fontWeight:700,color:soilingColor(s.soiling)}}>{s.soiling}%</td>
                <td style={{padding:"9px 8px"}}><Pill text={s.alert} type={typeMap[s.alert]}/></td>
                <td style={{padding:"9px 8px",color:"#162716"}}>{s.prod} kWh</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── ADMIN PARTNERS
function AdminPartners() {
  const [partners,setPartners]=useState([])
  useEffect(()=>{apiFetch("/api/partners").then(d=>setPartners(d.partners)).catch(()=>setPartners([
    {id:1,name:"SolarClean Maroc",city:"Casablanca",rating:4.8,reviews:142,tarif_kwp_30:800,phone:"+212 5 22 XX XX XX"},
    {id:2,name:"CleanSolar Pro",city:"Mohammédia",rating:4.6,reviews:89,tarif_kwp_30:800,phone:"+212 5 23 XX XX XX"},
    {id:3,name:"EcoPanel Services",city:"Rabat",rating:4.9,reviews:217,tarif_kwp_30:800,phone:"+212 5 37 XX XX XX"},
    {id:4,name:"SunWash Marrakech",city:"Marrakech",rating:4.5,reviews:74,tarif_kwp_30:750,phone:"+212 5 24 XX XX XX"},
  ]))},[])
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>Gestion des partenaires</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
        {partners.map(p=>(
          <div key={p.id} style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:44,height:44,borderRadius:10,background:"#F0FDF4",border:"0.5px solid rgba(22,163,74,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏪</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#162716"}}>{p.name}</div>
                <div style={{fontSize:12,color:"#7DA882"}}>{p.city}</div>
              </div>
              <Pill text="Certifié" type="gr"/>
            </div>
            {[{label:"Note",val:`★ ${p.rating} (${p.reviews} avis)`},{label:"Tarif 30 kWp",val:`${p.tarif_kwp_30} DH`},{label:"Téléphone",val:p.phone||"--"}].map(r=>(
              <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid rgba(20,49,31,0.05)",fontSize:12}}>
                <span style={{color:"#7DA882"}}>{r.label}</span>
                <span style={{fontWeight:600,color:"#162716"}}>{r.val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PARTNER DEMANDES
function PartnerDemandes() {
  const [selected,setSelected]=useState(null)
  const demandes=[
    {id:"REQ-001",client:"Ahmed Benali",site:"Bousfifa",soiling:25.7,date:"2026-05-26",note:"Accès portail sud",urgent:true},
    {id:"REQ-002",client:"Omar Tazi",site:"Marrakech",soiling:36.1,date:"2026-05-28",note:"",urgent:true},
    {id:"REQ-003",client:"Sara Alami",site:"Rabat",soiling:18.9,date:"2026-06-01",note:"Préférence matinale",urgent:false},
  ]
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <h1 style={{fontSize:20,fontWeight:700,color:"#162716"}}>Demandes de nettoyage</h1>
        <span style={{background:"#C81E1E",color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>{demandes.length} nouvelles</span>
      </div>
      {demandes.map(d=>(
        <div key={d.id} style={{background:"#fff",border:selected===d.id?"1.5px solid #16A34A":"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16,cursor:"pointer",marginBottom:12}} onClick={()=>setSelected(selected===d.id?null:d.id)}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:9,background:d.urgent?"#FEE2E2":"#F0FDF4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{d.urgent?"🚨":"📋"}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13.5,color:"#162716"}}>{d.client} — {d.site}</div>
              <div style={{fontSize:11.5,color:"#7DA882"}}>{d.id} · {d.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:700,color:soilingColor(d.soiling),fontSize:14}}>{d.soiling}%</div>
              {d.urgent&&<Pill text="URGENT" type="rd"/>}
            </div>
          </div>
          {selected===d.id&&(
            <div style={{borderTop:"0.5px solid rgba(20,49,31,0.08)",paddingTop:12,marginTop:12}}>
              {d.note&&<div style={{fontSize:12,color:"#3D6145",marginBottom:12}}>📝 {d.note}</div>}
              <div style={{display:"flex",gap:10}}>
                <button style={{flex:1,background:"#16A34A",color:"#fff",border:"none",padding:"9px 0",borderRadius:7,fontWeight:600,cursor:"pointer",fontSize:13}}>✅ Accepter</button>
                <button style={{flex:1,background:"#fff",color:"#C81E1E",border:"1px solid #C81E1E",padding:"9px 0",borderRadius:7,fontWeight:600,cursor:"pointer",fontSize:13}}>✗ Refuser</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── PARTNER INTERVENTIONS
function PartnerInterventions() {
  const items=[
    {id:"INT-001",client:"Ahmed Benali",site:"Bousfifa",date:"2026-05-26",heure:"09:00",kwp:10,statut:"confirmé"},
    {id:"INT-002",client:"Omar Tazi",site:"Marrakech",date:"2026-05-28",heure:"08:30",kwp:25,statut:"en attente"},
    {id:"INT-003",client:"Sara Alami",site:"Rabat",date:"2026-06-01",heure:"10:00",kwp:15,statut:"confirmé"},
  ]
  const mois=["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"]
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>📅 Interventions planifiées</h1>
      {items.map(iv=>(
        <div key={iv.id} style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16,display:"flex",alignItems:"center",gap:14,marginBottom:10}}>
          <div style={{textAlign:"center",background:"#F0FDF4",borderRadius:9,padding:"8px 14px",flexShrink:0}}>
            <div style={{fontSize:16,fontWeight:700,color:"#16A34A"}}>{iv.date.split("-")[2]}</div>
            <div style={{fontSize:10,color:"#7DA882"}}>{mois[parseInt(iv.date.split("-")[1])-1]}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13.5,color:"#162716"}}>{iv.client} — {iv.site}</div>
            <div style={{fontSize:12,color:"#7DA882"}}>{iv.heure} · {iv.kwp} kWp · {iv.id}</div>
          </div>
          <Pill text={iv.statut} type={iv.statut==="confirmé"?"gr":"am"}/>
        </div>
      ))}
    </div>
  )
}

// ── PARTNER HISTORIQUE
function PartnerHistorique() {
  const history=[
    {date:"2026-05-15",client:"Leila Fassi",site:"Fès",kwp:20,montant:1600,note:"Excellent résultat"},
    {date:"2026-05-08",client:"Ahmed Benali",site:"Bousfifa",kwp:10,montant:800,note:"Nettoyage standard"},
    {date:"2026-04-30",client:"Sara Alami",site:"Rabat",kwp:15,montant:1200,note:"Anti-poussière inclus"},
    {date:"2026-04-22",client:"Omar Tazi",site:"Marrakech",kwp:25,montant:1500,note:"Urgence"},
    {date:"2026-04-10",client:"Karim Idrissi",site:"Casablanca",kwp:30,montant:2400,note:"3 bâtiments"},
  ]
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>📜 Historique</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
        <Metric label="Interventions" value={`${history.length}`} sub="ce mois"/>
        <Metric label="Chiffre d'affaires" value={`${history.reduce((a,h)=>a+h.montant,0).toLocaleString()} DH`} sub="ce mois" color="#16A34A"/>
        <Metric label="Note moyenne" value="4.7 ★" sub="sur 5.0" color="#C97A06"/>
      </div>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:16}}>
        {history.map((h,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<history.length-1?"0.5px solid rgba(20,49,31,0.06)":"none"}}>
            <div style={{fontSize:11,color:"#7DA882",width:80,flexShrink:0}}>{h.date}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#162716"}}>{h.client} — {h.site}</div>
              <div style={{fontSize:11,color:"#7DA882"}}>{h.kwp} kWp · {h.note}</div>
            </div>
            <div style={{fontWeight:700,color:"#16A34A",fontSize:13}}>{h.montant} DH</div>
            <Pill text="Terminé ✓" type="gr"/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GENERIC PAGE
function GenericPage({ title, icon }) {
  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,color:"#162716",marginBottom:18}}>{icon} {title}</h1>
      <div style={{background:"#fff",border:"0.5px solid rgba(20,49,31,0.09)",borderRadius:11,padding:40,textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>{icon}</div>
        <div style={{fontSize:14,fontWeight:600,color:"#162716",marginBottom:6}}>{title}</div>
        <div style={{fontSize:12,color:"#7DA882"}}>Disponible dans la version complète.</div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════
const ROLES={client:{av:"AB",nm:"Ahmed B."},admin:{av:"SA",nm:"Solar AI"},partner:{av:"SC",nm:"SolarClean"}}
const NAV={
  client:[{id:"accueil",icon:"🏠",label:"Accueil"},{id:"analyses",icon:"📊",label:"Analyses"},{id:"alertes",icon:"🔔",label:"Alertes",badge:1},{id:"partenaires",icon:"🔧",label:"Partenaires"},{id:"reglages",icon:"⚙️",label:"Réglages"}],
  admin:[{id:"overview",icon:"🏠",label:"Vue globale"},{id:"clients",icon:"👥",label:"Clients"},{id:"analytics",icon:"📈",label:"Analytics"},{id:"partners",icon:"🔧",label:"Partenaires"},{id:"settings",icon:"⚙️",label:"Réglages"}],
  partner:[{id:"demandes",icon:"📥",label:"Demandes",badge:3},{id:"interventions",icon:"📅",label:"Interventions"},{id:"historique",icon:"📜",label:"Historique"},{id:"settings",icon:"⚙️",label:"Réglages"}],
}

export default function App() {
  const [role,setRole]=useState("client")
  const [page,setPage]=useState("accueil")
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)

  const loadData=useCallback(async()=>{
    setLoading(true)
    try{
      const r=await apiFetch("/api/dashboard/BOUSF_001?lat=33.40&lon=-7.55&capacity_kwp=10&days_since_cleaning=38&cout_nettoyage=800")
      setData(r)
    }catch(_){
      setData({date:new Date().toISOString().split("T")[0],weather:{irradiation_kwh_m2:6.82,temp_air_c:22.4,humidity_pct:62,wind_speed_ms:3.8,precipitation_mm:0.3},features:{days_since_last_rain:22,power_ratio:0.739,days_since_last_cleaning:38,irradiation_kwh_m2:6.82,temp_air_c:22.4,humidity_pct:62,wind_speed_ms:3.8,precipitation_mm:0.3,p_theoretical_kwh:53.07,installed_capacity_kwp:10},prediction:{soiling_m1_calcul:0.261,soiling_m2_ia:0.254,soiling_final:0.257,soiling_pct:25.7,gap_m1_m2:0.007,confidence_pct:95,diagnostic:"Accord M1/M2 — haute confiance",alert_soiling:"ALERTE",p_theoretical_kwh:53.07,p_real_kwh:39.2,power_ratio:0.739,perte_kwh_jour:13.65,perte_dh_jour:16.38,perte_cumulee_dh:622.4,cout_nettoyage_dh:800,gain_net_dh:-177.6,rentable:false,jours_break_even:67,jours_restants:11,alerte_nettoyage:"ATTENDRE"}})
    }
    setLoading(false)
  },[])

  useEffect(()=>{loadData()},[loadData])

  const renderPage=()=>{
    if(role==="client"){
      if(page==="accueil")     return <ClientDashboard data={data} loading={loading} onContactPartner={()=>setPage("partenaires")}/>
      if(page==="analyses")    return <AnalysesPage data={data}/>
      if(page==="alertes")     return <AlertesPage data={data}/>
      if(page==="partenaires") return <PartnersPage prediction={data?.prediction} onBack={()=>setPage("accueil")}/>
      if(page==="reglages")    return <ReglagesClientPage/>
    }
    if(role==="admin"){
      if(page==="overview") return <AdminOverview/>
      if(page==="partners") return <AdminPartners/>
      if(page==="clients")  return <GenericPage title="Clients" icon="👥"/>
      if(page==="analytics")return <GenericPage title="Analytics" icon="📈"/>
      if(page==="settings") return <GenericPage title="Réglages" icon="⚙️"/>
    }
    if(role==="partner"){
      if(page==="demandes")      return <PartnerDemandes/>
      if(page==="interventions") return <PartnerInterventions/>
      if(page==="historique")    return <PartnerHistorique/>
      if(page==="settings")      return <GenericPage title="Réglages" icon="⚙️"/>
    }
    return null
  }

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",fontSize:13.5,lineHeight:1.5,minHeight:"100vh",background:"#F2F7F2",display:"flex",flexDirection:"column"}}>
      <header style={{background:"#14311F",display:"flex",alignItems:"center",padding:"0 16px",height:54,gap:12,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:9,background:"#16A34A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>☀️</div>
          <span style={{color:"#fff",fontSize:15.5,fontWeight:700}}>Solar<span style={{color:"#4ADE80"}}>AI</span></span>
        </div>
        <div style={{display:"flex",gap:2,margin:"0 auto",background:"rgba(255,255,255,0.12)",padding:3,borderRadius:8}}>
          {["client","admin","partner"].map((r,i)=>(
            <button key={r} onClick={()=>{setRole(r);setPage(NAV[r][0].id)}} style={{padding:"5px 13px",borderRadius:6,fontSize:12.5,fontWeight:role===r?700:500,cursor:"pointer",border:"none",color:"#fff",opacity:role===r?1:0.72,background:role===r?"#16A34A":"transparent",display:"flex",alignItems:"center",gap:5}}>
              {["👤","🛡","🔧"][i]} {["Client","Admin","Partenaire"][i]}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"#4ADE80",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10.5,fontWeight:700,color:"#14311F"}}>{ROLES[role].av}</div>
          <span style={{color:"#fff",fontSize:12.5,fontWeight:500}}>{ROLES[role].nm}</span>
        </div>
      </header>
      <div style={{display:"flex",flex:1}}>
        <nav style={{width:196,background:"#14311F",padding:"12px 0",flexShrink:0,display:"flex",flexDirection:"column",borderRight:"0.5px solid rgba(74,222,128,0.08)"}}>
          <div style={{padding:"0 10px"}}>
            {NAV[role].map(item=>(
              <button key={item.id} onClick={()=>setPage(item.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"7.5px 9px",borderRadius:7,color:page===item.id?"#4ADE80":"#fff",opacity:page===item.id?1:0.78,cursor:"pointer",fontSize:13,fontWeight:page===item.id?600:400,border:"none",background:page===item.id?"rgba(74,222,128,0.15)":"transparent",width:"100%",textAlign:"left",marginBottom:2}}>
                <span style={{fontSize:15,flexShrink:0}}>{item.icon}</span>
                <span>{item.label}</span>
                {item.badge&&<span style={{marginLeft:"auto",background:"#C81E1E",color:"#fff",fontSize:9,fontWeight:700,padding:"1.5px 5.5px",borderRadius:10}}>{item.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{marginTop:"auto",padding:10,borderTop:"0.5px solid rgba(255,255,255,0.07)"}}>
            <div style={{padding:"5px 9px",fontSize:10,color:"rgba(255,255,255,0.25)",lineHeight:1.7}}>Solar AI v2.0 · Maroc © 2026</div>
          </div>
        </nav>
        <main style={{flex:1,background:"#F2F7F2",padding:20,overflowY:"auto"}}>
          {renderPage()}
        </main>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}} button:hover{opacity:0.9} *{box-sizing:border-box}`}</style>
    </div>
  )
}
