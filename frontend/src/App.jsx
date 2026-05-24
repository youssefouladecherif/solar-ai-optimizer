import { useState, useEffect, useCallback } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`)
  return r.json()
}

// ── Color helpers
const soilingColor = (pct) => {
  if (pct < 12)  return "#16A34A"
  if (pct < 20)  return "#C97A06"
  if (pct < 35)  return "#C2410C"
  return "#C81E1E"
}

const alertPill = {
  NORMAL:        { bg: "#DCFCE7", color: "#15803D", label: "NORMAL" },
  AVERTISSEMENT: { bg: "#FEF9C3", color: "#92400E", label: "AVERT." },
  ALERTE:        { bg: "#FFEDD5", color: "#9A3412", label: "ALERTE" },
  CRITIQUE:      { bg: "#FEE2E2", color: "#991B1B", label: "CRITIQUE" },
}

// ── Gauge SVG
function SoilingGauge({ pct = 25.7, alert = "ALERTE" }) {
  const max = 40, frac = Math.min(pct / max, 1)
  const cx = 110, cy = 100, R = 78
  const sa = Math.PI * 0.78, ea = Math.PI * 2.22
  const va = sa + (ea - sa) * frac
  const trackPath = describeArc(cx, cy, R, sa, ea)
  const valuePath = describeArc(cx, cy, R, sa, va)
  const nx = cx + Math.cos(va) * R, ny = cy + Math.sin(va) * R
  const col = soilingColor(pct)
  return (
    <svg width="220" height="155" role="img">
      <path d={trackPath} fill="none" stroke="rgba(20,49,31,0.08)" strokeWidth="15" strokeLinecap="round"/>
      <path d={valuePath} fill="none" stroke={col} strokeWidth="15" strokeLinecap="round"/>
      <circle cx={nx} cy={ny} r="7" fill={col}/>
      <circle cx={nx} cy={ny} r="3" fill="#fff"/>
      <text x={cx} y={cy-8}  textAnchor="middle" fontSize="28" fontWeight="700" fill="#162716">{pct}%</text>
      <text x={cx} y={cy+10} textAnchor="middle" fontSize="12" fontWeight="600" fill={col}>{alert}</text>
      <text x={cx} y={cy+26} textAnchor="middle" fontSize="11" fill="rgba(22,39,22,0.42)">Soiling Index</text>
    </svg>
  )
}

function describeArc(cx, cy, r, startA, endA) {
  const x1 = cx+Math.cos(startA)*r, y1 = cy+Math.sin(startA)*r
  const x2 = cx+Math.cos(endA)*r,   y2 = cy+Math.sin(endA)*r
  const large = endA - startA > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:9, padding:"12px 14px" }}>
      <div style={{ fontSize:10.5, textTransform:"uppercase", letterSpacing:"0.05em", color:"#7DA882", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:700, color: color||"#162716", lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#7DA882", marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function Pill({ text, type="gr" }) {
  const styles = {
    gr: { bg:"rgba(22,163,74,0.11)",  color:"#15803D" },
    am: { bg:"rgba(201,122,6,0.11)",  color:"#92400E" },
    or: { bg:"rgba(194,65,12,0.11)",  color:"#9A3412" },
    rd: { bg:"rgba(200,30,30,0.11)",  color:"#991B1B" },
    bl: { bg:"rgba(3,105,161,0.10)",  color:"#075985" },
  }
  const s = styles[type]||styles.gr
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2.5px 9px", borderRadius:20, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>{text}</span>
}

function RoiBar({ accumulated, target }) {
  const pct = Math.min((accumulated/target)*100, 100)
  return (
    <div>
      <div style={{ height:5, background:"rgba(201,122,6,0.12)", borderRadius:3, overflow:"hidden", marginTop:8 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:"#C97A06", borderRadius:3, transition:"width 0.7s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, color:"#92400E", marginTop:3 }}>
        <span>{Math.round(accumulated)} DH accumulés</span>
        <span>{Math.round(target)} DH seuil</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  CLIENT — ACCUEIL
// ══════════════════════════════════════════════════════════
function ClientDashboard({ data, loading, onContactPartner }) {
  if (loading) return <div style={{ padding:40, textAlign:"center", color:"#7DA882" }}>Chargement des données...</div>
  if (!data)   return <div style={{ padding:40, textAlign:"center", color:"#7DA882" }}>Aucune donnée disponible</div>
  const p = data.prediction, w = data.weather
  const alertType = { NORMAL:"gr", AVERTISSEMENT:"am", ALERTE:"or", CRITIQUE:"rd" }[p.alert_soiling]||"gr"
  const roiType   = { ATTENDRE:"am", PLANIFIER:"gr", URGENT:"or", CRITIQUE:"rd" }[p.alerte_nettoyage]||"am"
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:"#162716" }}>Tableau de bord</h1>
        <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:"0.5px solid rgba(20,49,31,0.17)", borderRadius:7, padding:"5px 11px", fontSize:11.5, color:"#3D6145" }}>
          <span style={{ width:6, height:6, background:"#16A34A", borderRadius:"50%", display:"inline-block" }}></span>
          EN DIRECT · {new Date().toLocaleTimeString("fr-FR")}
        </div>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[
          { icon:"🌿", label:"CO₂ évité", val:`${Math.round((w?.irradiation_kwh_m2||0)*0.43)} kg` },
          { icon:"☀️", label:"Production", val:`${p.p_theoretical_kwh} kWh/j théorique` },
          { icon:"💰", label:"Économies", val:`${Math.round(p.p_real_kwh||p.p_theoretical_kwh*(1-p.soiling_final)*1.2*30)} DH/mois` }
        ].map(item => (
          <div key={item.label} style={{ flex:1, display:"flex", alignItems:"center", gap:6, background:"#fff", border:"0.5px solid rgba(22,163,74,0.22)", borderRadius:8, padding:"7px 11px", fontSize:12, color:"#16A34A" }}>
            <span>{item.icon}</span><span style={{ color:"#3D6145" }}>{item.label} : </span><strong>{item.val}</strong>
          </div>
        ))}
      </div>
      {p.alert_soiling !== "NORMAL" && (
        <div style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(200,30,30,0.07)", border:"0.5px solid rgba(200,30,30,0.22)", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ width:34, height:34, background:"rgba(200,30,30,0.13)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:"#C81E1E", fontSize:18, flexShrink:0 }}>⚠</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13.5, color:"#C81E1E", marginBottom:2 }}>Encrassement détecté — {p.soiling_pct}% · {p.alert_soiling}</div>
            <div style={{ fontSize:12, color:"#7F1D1D" }}>{p.rentable ? `Nettoyage recommandé maintenant` : `Nettoyage rentable dans ${Math.round(p.jours_restants)} jours`} · Perte : {p.perte_dh_jour} DH/jour</div>
          </div>
          <button onClick={onContactPartner} style={{ background:"#16A34A", color:"#fff", border:"none", padding:"7px 14px", borderRadius:7, fontSize:12.5, fontWeight:600, cursor:"pointer" }}>Contacter un partenaire</button>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:"18px 14px", display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10, alignSelf:"flex-start" }}>Indice de propreté (IA)</div>
          <SoilingGauge pct={p.soiling_pct} alert={p.alert_soiling}/>
          <div style={{ display:"flex", gap:5, marginTop:9, flexWrap:"wrap", justifyContent:"center" }}>
            <Pill text="0–12% Propre" type="gr"/><Pill text="12–20% Avert." type="am"/><Pill text="20–35% Alerte" type="or"/>
          </div>
          <div style={{ marginTop:11, paddingTop:11, borderTop:"0.5px solid rgba(20,49,31,0.09)", width:"100%", display:"grid", gridTemplateColumns:"repeat(3,1fr)", textAlign:"center", gap:4 }}>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>M1 Calcul</div><div style={{ fontWeight:700, fontSize:13 }}>{(p.soiling_m1_calcul*100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>M2 IA</div><div style={{ fontWeight:700, fontSize:13 }}>{(p.soiling_m2_ia*100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>Confiance</div><div style={{ fontWeight:700, fontSize:13, color:"#16A34A" }}>{p.confidence_pct}%</div></div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Production aujourd'hui</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:5, marginBottom:7 }}>
              <span style={{ fontSize:26, fontWeight:700, color:"#162716" }}>{p.p_real_kwh||(p.p_theoretical_kwh*(1-p.soiling_final)).toFixed(1)}</span>
              <span style={{ color:"#7DA882", fontSize:12 }}>/ {p.p_theoretical_kwh} kWh théorique</span>
            </div>
            <div style={{ height:5, background:"rgba(20,49,31,0.08)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(p.power_ratio*100).toFixed(0)}%`, background:"#C97A06", borderRadius:3 }}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:11 }}>
              <span style={{ color:"#7DA882" }}>Power ratio : {(p.power_ratio*100).toFixed(1)}%</span>
              <span style={{ color:"#C81E1E" }}>-{p.perte_kwh_jour} kWh perdus</span>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
            <Metric label="Perte / jour" value={`${p.perte_dh_jour} DH`} sub={`${p.perte_kwh_jour} kWh`} color="#C81E1E"/>
            <Metric label="Perte cumulée" value={`${Math.round(p.perte_cumulee_dh)} DH`} sub={`Depuis ${data.features?.days_since_last_cleaning||0} jours`} color="#C97A06"/>
          </div>
          <div style={{ background:"#FFFBEB", border:"0.5px solid rgba(201,122,6,0.22)", borderRadius:10, padding:15 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#C97A06" }}>💰 ROI Nettoyage</span>
              <Pill text={p.alerte_nettoyage} type={roiType}/>
            </div>
            <div style={{ fontSize:22, fontWeight:700, color:"#162716" }}>{p.rentable ? "Nettoyez maintenant !" : `${Math.round(p.jours_restants)} jours restants`}</div>
            <div style={{ fontSize:11.5, color:"#92400E" }}>{p.rentable ? `Gain net : +${Math.round(p.gain_net_dh)} DH` : "avant que le nettoyage soit rentable"}</div>
            <RoiBar accumulated={p.perte_cumulee_dh} target={p.cout_nettoyage_dh}/>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        <Metric label="Jours sans pluie" value={`${data.features?.days_since_last_rain||0} j`}/>
        <Metric label="Irradiation" value={`${(w?.irradiation_kwh_m2||0).toFixed(2)} kWh/m²`}/>
        <Metric label="Température" value={`${(w?.temp_air_c||0).toFixed(1)}°C`}/>
        <Metric label="Vent" value={`${(w?.wind_speed_ms||0).toFixed(1)} m/s`}/>
      </div>
      <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Diagnostic IA</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🤖</span>
          <div>
            <div style={{ fontWeight:600, color:"#162716", marginBottom:2 }}>{p.diagnostic}</div>
            <div style={{ fontSize:12, color:"#3D6145" }}>Écart M1/M2 : {(p.gap_m1_m2*100).toFixed(1)}% · Confiance hybride : {p.confidence_pct}%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  CLIENT — ANALYSES
// ══════════════════════════════════════════════════════════
function AnalysesPage({ data }) {
  const trend = [
    { jour:"J-30", soiling:8.2,  prod:51.2, pluie:false },
    { jour:"J-25", soiling:10.1, prod:50.1, pluie:false },
    { jour:"J-20", soiling:14.3, prod:47.8, pluie:false },
    { jour:"J-15", soiling:18.7, prod:45.2, pluie:false },
    { jour:"J-10", soiling:22.4, prod:42.1, pluie:false },
    { jour:"J-5",  soiling:24.8, prod:40.5, pluie:false },
    { jour:"Auj.", soiling: data?.prediction?.soiling_pct||25.7, prod: parseFloat(data?.prediction?.p_real_kwh||39.2), pluie:false },
  ]
  const p = data?.prediction
  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:700, color:"#162716", marginBottom:18 }}>Analyses & Tendances</h1>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:12 }}>Évolution du Soiling Index (30 jours)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,49,31,0.06)"/>
              <XAxis dataKey="jour" tick={{ fontSize:10, fill:"#7DA882" }}/>
              <YAxis tick={{ fontSize:10, fill:"#7DA882" }} unit="%"/>
              <Tooltip formatter={(v) => [`${v}%`, "Soiling"]} contentStyle={{ fontSize:11, borderRadius:7 }}/>
              <Line type="monotone" dataKey="soiling" stroke="#C97A06" strokeWidth={2} dot={{ r:3, fill:"#C97A06" }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:12 }}>Production réelle vs théorique (kWh/j)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,49,31,0.06)"/>
              <XAxis dataKey="jour" tick={{ fontSize:10, fill:"#7DA882" }}/>
              <YAxis tick={{ fontSize:10, fill:"#7DA882" }}/>
              <Tooltip contentStyle={{ fontSize:11, borderRadius:7 }}/>
              <Legend wrapperStyle={{ fontSize:10 }}/>
              <Bar dataKey="prod" name="Production (kWh)" fill="#16A34A" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:8 }}>Météo d'aujourd'hui</div>
          {[
            { icon:"☀️", label:"Irradiation", val:`${(data?.weather?.irradiation_kwh_m2||6.82).toFixed(2)} kWh/m²` },
            { icon:"🌡️", label:"Température", val:`${(data?.weather?.temp_air_c||22.4).toFixed(1)}°C` },
            { icon:"💧", label:"Humidité",    val:`${(data?.weather?.humidity_pct||62).toFixed(0)}%` },
            { icon:"🌬️", label:"Vent",        val:`${(data?.weather?.wind_speed_ms||3.8).toFixed(1)} m/s` },
            { icon:"🌧️", label:"Précipitations", val:`${(data?.weather?.precipitation_mm||0.3).toFixed(1)} mm` },
          ].map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"0.5px solid rgba(20,49,31,0.05)" }}>
              <span style={{ fontSize:12, color:"#3D6145" }}>{r.icon} {r.label}</span>
              <span style={{ fontSize:12, fontWeight:600, color:"#162716" }}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:8 }}>Performance IA</div>
          {[
            { label:"Méthode M1 (physique)", val:`${p ? (p.soiling_m1_calcul*100).toFixed(1) : "--"}%` },
            { label:"Méthode M2 (IA MLP)",   val:`${p ? (p.soiling_m2_ia*100).toFixed(1)    : "--"}%` },
            { label:"Résultat hybride",       val:`${p ? p.soiling_pct                       : "--"}%` },
            { label:"Niveau de confiance",    val:`${p ? p.confidence_pct                    : "--"}%` },
            { label:"Diagnostic",             val: p?.diagnostic || "--" },
          ].map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"0.5px solid rgba(20,49,31,0.05)", gap:8 }}>
              <span style={{ fontSize:11, color:"#3D6145" }}>{r.label}</span>
              <span style={{ fontSize:11, fontWeight:600, color:"#162716", textAlign:"right" }}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:8 }}>Bilan mensuel estimé</div>
          {[
            { label:"Production théorique", val:`${p ? Math.round(p.p_theoretical_kwh*30) : "--"} kWh` },
            { label:"Production réelle",    val:`${p ? Math.round((p.p_real_kwh||p.p_theoretical_kwh*(1-p.soiling_final))*30) : "--"} kWh` },
            { label:"Perte totale",         val:`${p ? Math.round(p.perte_kwh_jour*30)   : "--"} kWh`, color:"#C81E1E" },
            { label:"Perte financière",     val:`${p ? Math.round(p.perte_dh_jour*30)    : "--"} DH`,  color:"#C81E1E" },
            { label:"Économies réalisées",  val:`${p ? Math.round(p.p_theoretical_kwh*(1-p.soiling_final)*1.2*30) : "--"} DH`, color:"#16A34A" },
          ].map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"0.5px solid rgba(20,49,31,0.05)" }}>
              <span style={{ fontSize:11, color:"#3D6145" }}>{r.label}</span>
              <span style={{ fontSize:12, fontWeight:600, color: r.color||"#162716" }}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  CLIENT — ALERTES
// ══════════════════════════════════════════════════════════
function AlertesPage({ data }) {
  const p = data?.prediction
  const alertLevel = p?.alert_soiling || "ALERTE"
  const alertColors = { NORMAL:"#16A34A", AVERTISSEMENT:"#C97A06", ALERTE:"#C2410C", CRITIQUE:"#C81E1E" }
  const color = alertColors[alertLevel] || "#C81E1E"
  const historique = [
    { date:"2026-04-15", niveau:"CRITIQUE",      soiling:38.2, action:"Nettoyage effectué ✓" },
    { date:"2026-03-20", niveau:"ALERTE",         soiling:29.1, action:"Nettoyage effectué ✓" },
    { date:"2026-02-10", niveau:"AVERTISSEMENT",  soiling:17.5, action:"Surveillance" },
    { date:"2026-01-05", niveau:"ALERTE",         soiling:24.8, action:"Nettoyage effectué ✓" },
    { date:"2025-12-01", niveau:"NORMAL",         soiling:9.2,  action:"RAS" },
  ]
  const typeMap = { NORMAL:"gr", AVERTISSEMENT:"am", ALERTE:"or", CRITIQUE:"rd" }
  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:700, color:"#162716", marginBottom:18 }}>Alertes & Notifications</h1>
      {/* Alerte active */}
      <div style={{ background:`${color}11`, border:`0.5px solid ${color}44`, borderRadius:12, padding:"18px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ width:48, height:48, background:`${color}22`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>
          {alertLevel === "NORMAL" ? "✅" : alertLevel === "AVERTISSEMENT" ? "⚠️" : "🚨"}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16, color, marginBottom:4 }}>
            Alerte active : {alertLevel}
          </div>
          <div style={{ fontSize:13, color:"#3D6145" }}>
            Soiling index actuel : <strong>{p?.soiling_pct || 25.7}%</strong> ·
            Perte journalière : <strong>{p?.perte_dh_jour || 16.38} DH/jour</strong>
          </div>
          <div style={{ fontSize:12, color:"#7DA882", marginTop:4 }}>
            {alertLevel === "NORMAL"
              ? "Aucune action requise. Panneaux en bon état."
              : alertLevel === "AVERTISSEMENT"
              ? "Surveiller l'évolution. Prévoir un nettoyage dans les prochaines semaines."
              : "Nettoyage recommandé. Contacter un partenaire certifié."}
          </div>
        </div>
        <Pill text={alertLevel} type={typeMap[alertLevel]||"or"}/>
      </div>
      {/* Seuils */}
      <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:12 }}>Seuils d'alerte configurés</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {[
            { label:"NORMAL",        range:"0% – 12%",   color:"#16A34A", bg:"#DCFCE7", active: alertLevel==="NORMAL" },
            { label:"AVERTISSEMENT", range:"12% – 20%",  color:"#C97A06", bg:"#FEF9C3", active: alertLevel==="AVERTISSEMENT" },
            { label:"ALERTE",        range:"20% – 35%",  color:"#C2410C", bg:"#FFEDD5", active: alertLevel==="ALERTE" },
            { label:"CRITIQUE",      range:"> 35%",      color:"#C81E1E", bg:"#FEE2E2", active: alertLevel==="CRITIQUE" },
          ].map(s => (
            <div key={s.label} style={{ background: s.active ? s.bg : "#F9FBF9", border:`1.5px solid ${s.active ? s.color : "rgba(20,49,31,0.08)"}`, borderRadius:9, padding:"12px 10px", textAlign:"center" }}>
              <div style={{ fontSize:11, fontWeight:700, color: s.color, marginBottom:3 }}>{s.label}</div>
              <div style={{ fontSize:12, color:"#162716", fontWeight:600 }}>{s.range}</div>
              {s.active && <div style={{ fontSize:9.5, color: s.color, marginTop:4, fontWeight:600 }}>← ACTUEL</div>}
            </div>
          ))}
        </div>
      </div>
      {/* Historique */}
      <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:12 }}>Historique des alertes</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {historique.map((h, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"#F9FBF9", borderRadius:8, border:"0.5px solid rgba(20,49,31,0.07)" }}>
              <div style={{ fontSize:11, color:"#7DA882", width:78, flexShrink:0 }}>{h.date}</div>
              <Pill text={h.niveau} type={typeMap[h.niveau]||"gr"}/>
              <div style={{ fontSize:12, color:"#162716", flex:1 }}>Soiling : <strong>{h.soiling}%</strong></div>
              <div style={{ fontSize:11.5, color: h.action.includes("✓") ? "#16A34A" : "#7DA882" }}>{h.action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  CLIENT — RÉGLAGES
// ══════════════════════════════════════════════════════════
function ReglagesClientPage() {
  const [saved, setSaved] = useState(false)
  const [form, setForm]   = useState({
    station: "BOUSF_001", lat:"33.40", lon:"-7.55",
    capacity:"10", cout:"800", tarif:"1.20",
    fusionUser:"Optimizer-api", fusionCode:""
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:700, color:"#162716", marginBottom:18 }}>Réglages de la station</h1>
      {saved && (
        <div style={{ background:"#F0FDF4", border:"0.5px solid rgba(22,163,74,0.3)", borderRadius:9, padding:"10px 14px", marginBottom:16, color:"#16A34A", fontSize:13, fontWeight:600 }}>
          ✅ Paramètres sauvegardés avec succès !
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#162716", marginBottom:14 }}>📍 Configuration de la station</div>
          {[
            { label:"Code station",       key:"station",  type:"text",   placeholder:"BOUSF_001" },
            { label:"Latitude",           key:"lat",      type:"number", placeholder:"33.40" },
            { label:"Longitude",          key:"lon",      type:"number", placeholder:"-7.55" },
            { label:"Capacité installée (kWp)", key:"capacity", type:"number", placeholder:"10" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:"#7DA882", marginBottom:4 }}>{f.label}</div>
              <input type={f.type} value={form[f.key]} onChange={e=>set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:"0.5px solid rgba(20,49,31,0.17)", background:"#F2F7F2", color:"#162716", fontSize:12.5 }}/>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"colum