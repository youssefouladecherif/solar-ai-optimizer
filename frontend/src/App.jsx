import { useState, useEffect, useCallback } from "react"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

// ── Fetch helper
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
  NORMAL:         { bg: "#DCFCE7", color: "#15803D", label: "NORMAL" },
  AVERTISSEMENT:  { bg: "#FEF9C3", color: "#92400E", label: "AVERT." },
  ALERTE:         { bg: "#FFEDD5", color: "#9A3412", label: "ALERTE" },
  CRITIQUE:       { bg: "#FEE2E2", color: "#991B1B", label: "CRITIQUE" },
}

// ── Gauge SVG Component
function SoilingGauge({ pct = 25.7, alert = "ALERTE" }) {
  const max  = 40
  const frac = Math.min(pct / max, 1)
  const cx = 110, cy = 100, R = 78
  const sa  = Math.PI * 0.78
  const ea  = Math.PI * 2.22
  const va  = sa + (ea - sa) * frac
  const trackPath = describeArc(cx, cy, R, sa, ea)
  const valuePath = describeArc(cx, cy, R, sa, va)
  const nx = cx + Math.cos(va) * R
  const ny = cy + Math.sin(va) * R
  const col = soilingColor(pct)

  return (
    <svg width="220" height="155" role="img" aria-label={`Soiling index ${pct}%`}>
      <path d={trackPath} fill="none" stroke="rgba(20,49,31,0.08)" strokeWidth="15" strokeLinecap="round"/>
      <path d={valuePath} fill="none" stroke={col} strokeWidth="15" strokeLinecap="round"/>
      <circle cx={nx} cy={ny} r="7" fill={col}/>
      <circle cx={nx} cy={ny} r="3" fill="#fff"/>
      <text x={cx} y={cy - 8}  textAnchor="middle" fontSize="28" fontWeight="700" fill="#162716">{pct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="12" fontWeight="600" fill={col}>{alert}</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize="11" fill="rgba(22,39,22,0.42)">Soiling Index</text>
    </svg>
  )
}

function describeArc(cx, cy, r, startA, endA) {
  const x1 = cx + Math.cos(startA) * r
  const y1 = cy + Math.sin(startA) * r
  const x2 = cx + Math.cos(endA) * r
  const y2 = cy + Math.sin(endA) * r
  const large = endA - startA > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

// ── Metric Card
function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:9, padding:"12px 14px" }}>
      <div style={{ fontSize:10.5, textTransform:"uppercase", letterSpacing:"0.05em", color:"#7DA882", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:700, color: color || "#162716", lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#7DA882", marginTop:2 }}>{sub}</div>}
    </div>
  )
}

// ── Pill Badge
function Pill({ text, type = "gr" }) {
  const styles = {
    gr: { bg:"rgba(22,163,74,0.11)", color:"#15803D" },
    am: { bg:"rgba(201,122,6,0.11)",  color:"#92400E" },
    or: { bg:"rgba(194,65,12,0.11)",  color:"#9A3412" },
    rd: { bg:"rgba(200,30,30,0.11)",  color:"#991B1B" },
    bl: { bg:"rgba(3,105,161,0.10)",  color:"#075985" },
  }
  const s = styles[type] || styles.gr
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2.5px 9px", borderRadius:20, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
      {text}
    </span>
  )
}

// ── ROI Progress Bar
function RoiBar({ accumulated, target }) {
  const pct = Math.min((accumulated / target) * 100, 100)
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
//  CLIENT DASHBOARD PAGE
// ══════════════════════════════════════════════════════════

function ClientDashboard({ data, loading, onContactPartner }) {
  if (loading) return <div style={{ padding:40, textAlign:"center", color:"#7DA882" }}>Chargement des données...</div>
  if (!data)   return <div style={{ padding:40, textAlign:"center", color:"#7DA882" }}>Aucune donnée disponible</div>

  const p = data.prediction
  const w = data.weather
  const alertType = { NORMAL:"gr", AVERTISSEMENT:"am", ALERTE:"or", CRITIQUE:"rd" }[p.alert_soiling] || "gr"
  const roiType   = { ATTENDRE:"am", PLANIFIER:"gr", URGENT:"or", CRITIQUE:"rd" }[p.alerte_nettoyage] || "am"

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:"#162716" }}>Tableau de bord</h1>
        <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:"0.5px solid rgba(20,49,31,0.17)", borderRadius:7, padding:"5px 11px", fontSize:11.5, color:"#3D6145" }}>
          <span style={{ width:6, height:6, background:"#16A34A", borderRadius:"50%", animation:"pulse 2s infinite", display:"inline-block" }}></span>
          EN DIRECT · {new Date().toLocaleTimeString("fr-FR")}
        </div>
      </div>

      {/* Eco strip */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[
          { icon:"🌿", label:"CO₂ évité", val: `${Math.round((data.weather?.irradiation_kwh_m2 || 0) * 0.43)} kg` },
          { icon:"☀️", label:"Production", val: `${p.p_theoretical_kwh} kWh/j théorique` },
          { icon:"💰", label:"Économies", val: `${Math.round(p.p_real_kwh || p.p_theoretical_kwh * (1 - p.soiling_final) * 1.2 * 30)} DH/mois` }
        ].map(item => (
          <div key={item.label} style={{ flex:1, display:"flex", alignItems:"center", gap:6, background:"#fff", border:"0.5px solid rgba(22,163,74,0.22)", borderRadius:8, padding:"7px 11px", fontSize:12, color:"#16A34A" }}>
            <span>{item.icon}</span>
            <span style={{ color:"#3D6145" }}>{item.label} : </span>
            <strong>{item.val}</strong>
          </div>
        ))}
      </div>

      {/* Alert banner */}
      {p.alert_soiling !== "NORMAL" && (
        <div style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(200,30,30,0.07)", border:"0.5px solid rgba(200,30,30,0.22)", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ width:34, height:34, background:"rgba(200,30,30,0.13)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:"#C81E1E", fontSize:18, flexShrink:0 }}>⚠</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13.5, color:"#C81E1E", marginBottom:2 }}>Encrassement détecté — {p.soiling_pct}% · {p.alert_soiling}</div>
            <div style={{ fontSize:12, color:"#7F1D1D" }}>
              {p.rentable ? `Nettoyage recommandé maintenant` : `Nettoyage rentable dans ${Math.round(p.jours_restants)} jours`} · Perte : {p.perte_dh_jour} DH/jour
            </div>
          </div>
          <button onClick={onContactPartner} style={{ background:"#16A34A", color:"#fff", border:"none", padding:"7px 14px", borderRadius:7, fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
            Contacter un partenaire
          </button>
        </div>
      )}

      {/* Main grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>

        {/* Soiling Gauge */}
        <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:"18px 14px", display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10, alignSelf:"flex-start" }}>Indice de propreté (IA)</div>
          <SoilingGauge pct={p.soiling_pct} alert={p.alert_soiling}/>
          <div style={{ display:"flex", gap:5, marginTop:9, flexWrap:"wrap", justifyContent:"center" }}>
            <Pill text="0–12% Propre" type="gr"/>
            <Pill text="12–20% Avert." type="am"/>
            <Pill text="20–35% Alerte" type="or"/>
          </div>
          <div style={{ marginTop:11, paddingTop:11, borderTop:"0.5px solid rgba(20,49,31,0.09)", width:"100%", display:"grid", gridTemplateColumns:"repeat(3,1fr)", textAlign:"center", gap:4 }}>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>M1 Calcul</div><div style={{ fontWeight:700, fontSize:13 }}>{(p.soiling_m1_calcul * 100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>M2 IA</div><div style={{ fontWeight:700, fontSize:13 }}>{(p.soiling_m2_ia * 100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize:10, color:"#7DA882" }}>Confiance</div><div style={{ fontWeight:700, fontSize:13, color:"#16A34A" }}>{p.confidence_pct}%</div></div>
          </div>
        </div>

        {/* Production metrics */}
        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Production aujourd'hui</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:5, marginBottom:7 }}>
              <span style={{ fontSize:26, fontWeight:700, color:"#162716" }}>{p.p_real_kwh || (p.p_theoretical_kwh * (1 - p.soiling_final)).toFixed(1)}</span>
              <span style={{ color:"#7DA882", fontSize:12 }}>/ {p.p_theoretical_kwh} kWh théorique</span>
            </div>
            <div style={{ height:5, background:"rgba(20,49,31,0.08)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(p.power_ratio * 100).toFixed(0)}%`, background:"#C97A06", borderRadius:3 }}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:11 }}>
              <span style={{ color:"#7DA882" }}>Power ratio : {(p.power_ratio * 100).toFixed(1)}%</span>
              <span style={{ color:"#C81E1E" }}>-{p.perte_kwh_jour} kWh perdus</span>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
            <Metric label="Perte / jour" value={`${p.perte_dh_jour} DH`} sub={`${p.perte_kwh_jour} kWh`} color="#C81E1E"/>
            <Metric label="Perte cumulée" value={`${Math.round(p.perte_cumulee_dh)} DH`} sub={`Depuis ${data.features?.days_since_last_cleaning || 0} jours`} color="#C97A06"/>
          </div>

          {/* ROI Card */}
          <div style={{ background:"#FFFBEB", border:"0.5px solid rgba(201,122,6,0.22)", borderRadius:10, padding:15 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#C97A06" }}>💰 ROI Nettoyage</span>
              <Pill text={p.alerte_nettoyage} type={roiType}/>
            </div>
            <div style={{ fontSize:22, fontWeight:700, color:"#162716" }}>
              {p.rentable ? "Nettoyez maintenant !" : `${Math.round(p.jours_restants)} jours restants`}
            </div>
            <div style={{ fontSize:11.5, color:"#92400E", marginBottom:0 }}>
              {p.rentable ? `Gain net : +${Math.round(p.gain_net_dh)} DH si vous nettoyez aujourd'hui` : "avant que le nettoyage soit rentable"}
            </div>
            <RoiBar accumulated={p.perte_cumulee_dh} target={p.cout_nettoyage_dh}/>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        <Metric label="Jours sans pluie" value={`${data.features?.days_since_last_rain || 0} j`}/>
        <Metric label="Irradiation" value={`${(w?.irradiation_kwh_m2 || 0).toFixed(2)} kWh/m²`}/>
        <Metric label="Température" value={`${(w?.temp_air_c || 0).toFixed(1)}°C`}/>
        <Metric label="Vent" value={`${(w?.wind_speed_ms || 0).toFixed(1)} m/s`}/>
      </div>

      {/* Diagnostic */}
      <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16 }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Diagnostic IA</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🤖</span>
          <div>
            <div style={{ fontWeight:600, color:"#162716", marginBottom:2 }}>{p.diagnostic}</div>
            <div style={{ fontSize:12, color:"#3D6145" }}>Écart M1/M2 : {(p.gap_m1_m2 * 100).toFixed(1)}% · Confiance hybride : {p.confidence_pct}%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  PARTNER CONTACT PAGE
// ══════════════════════════════════════════════════════════

function PartnersPage({ prediction, onBack }) {
  const [partners, setPartners] = useState([])
  const [selected, setSelected] = useState(null)
  const [sent, setSent]         = useState(false)
  const [date, setDate]         = useState("")
  const [note, setNote]         = useState("")

  useEffect(() => {
    apiFetch("/api/partners?lat=33.57&lon=-7.59")
      .then(d => setPartners(d.partners))
      .catch(() => setPartners([
        { id:1, name:"SolarClean Maroc",  city:"Casablanca", rating:4.8, reviews:142, tarif_kwp_30:800, availability:"demain",      distance_km:3.2 },
        { id:2, name:"CleanSolar Pro",    city:"Mohammédia", rating:4.6, reviews:89,  tarif_kwp_30:800, availability:"dans 3 jours", distance_km:18 },
        { id:3, name:"EcoPanel Services", city:"Rabat",      rating:4.9, reviews:217, tarif_kwp_30:800, availability:"dans 5 jours", distance_km:92 },
      ]))
  }, [])

  const sendRequest = async () => {
    try {
      await apiFetch(`/api/cleaning-request?partner_id=${selected}&station_code=BOUSF_001&client_name=Ahmed+Benali&soiling_pct=${prediction?.soiling_pct || 25.7}&requested_date=${date}&note=${note}`, { method:"POST" })
    } catch(_) {}
    setSent(true)
  }

  if (sent) return (
    <div style={{ textAlign:"center", padding:"40px 20px" }}>
      <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
      <div style={{ fontSize:17, fontWeight:700, marginBottom:6 }}>Demande envoyée avec succès !</div>
      <div style={{ fontSize:12.5, color:"#3D6145" }}>Le partenaire a reçu votre demande avec tous les détails.<br/>Confirmation sous 2h par WhatsApp ou email.</div>
      <button onClick={onBack} style={{ marginTop:16, background:"#16A34A", color:"#fff", border:"none", padding:"9px 20px", borderRadius:7, cursor:"pointer", fontWeight:600 }}>Retour au tableau de bord</button>
    </div>
  )

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:"#162716" }}>Demande de nettoyage</h1>
        <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:7, border:"0.5px solid rgba(20,49,31,0.17)", background:"#fff", color:"#162716", cursor:"pointer" }}>← Retour</button>
      </div>

      {prediction && (
        <div style={{ background:"#F0FDF4", border:"0.5px solid rgba(22,163,74,0.22)", borderRadius:10, padding:"12px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:11 }}>
          <div style={{ width:32, height:32, background:"rgba(22,163,74,0.15)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:"#16A34A", fontSize:16, flexShrink:0 }}>☀</div>
          <div>
            <div style={{ fontWeight:700, color:"#16A34A", fontSize:13 }}>Station Bousfifa</div>
            <div style={{ fontSize:11.5, color:"#3D6145" }}>Soiling {prediction.soiling_pct}% · Perte {prediction.perte_cumulee_dh} DH cumulés</div>
          </div>
        </div>
      )}

      <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Partenaires certifiés à proximité</div>

      <div style={{ display:"flex", flexDirection:"column", gap:9, marginBottom:16 }}>
        {partners.map(p => (
          <div key={p.id} onClick={() => setSelected(p.id)} style={{ background:"#fff", border:selected===p.id ? "1.5px solid #16A34A" : "0.5px solid rgba(20,49,31,0.09)", borderRadius:10, padding:14, cursor:"pointer", background:selected===p.id ? "#F0FDF4" : "#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:11 }}>
              <div style={{ width:42, height:42, borderRadius:9, background:"#F0FDF4", border:"0.5px solid rgba(22,163,74,0.22)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 }}>🏪</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:"#162716" }}>{p.name}</div>
                <div style={{ fontSize:11.5, color:"#7DA882" }}>{p.city} · {p.distance_km} km · ★ {p.rating} ({p.reviews} avis)</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontWeight:700, color:"#C97A06", fontSize:14 }}>{p.tarif_kwp_30} DH</div>
                <div style={{ fontSize:11, color:p.availability === "demain" ? "#16A34A" : "#7DA882" }}>{p.availability}</div>
              </div>
              {selected === p.id && <span style={{ fontSize:20, color:"#16A34A" }}>✓</span>}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div>
          <div style={{ background:"#fff", border:"0.5px solid rgba(20,49,31,0.09)", borderRadius:11, padding:16, marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", color:"#7DA882", marginBottom:10 }}>Détails de la demande</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><div style={{ fontSize:11, color:"#7DA882", marginBottom:4 }}>Date souhaitée</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:"0.5px solid rgba(20,49,31,0.17)", background:"#F2F7F2", color:"#162716", fontSize:12.5 }}/></div>
              <div><div style={{ fontSize:11, color:"#7DA882", marginBottom:4 }}>Note</div><input type="text" placeholder="Accès par le portail sud..." value={note} onChange={e=>setNote(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:"0.5px solid rgba(20,49,31,0.17)", background:"#F2F7F2", color:"#162716", fontSize:12.5 }}/></div>
            </div>
          </div>
          <button onClick={sendRequest} style={{ width:"100%", background:"#16A34A", color:"#fff", border:"none", padding:11, borderRadius:7, fontSize:13.5, fontWeight:600, cursor:"pointer" }}>
            📤 Envoyer la demande de nettoyage
          </button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════

const ROLES = {
  client:  { av:"AB", nm:"Ahmed B.",  pages:["accueil","partenaires","analyses","alertes","reglages"] },
  admin:   { av:"SA", nm:"Solar AI",  pages:["overview","clients","analytics","partners","settings"] },
  partner: { av:"SC", nm:"SolarClean", pages:["demandes","interventions","historique","settings"] },
}

const NAV = {
  client:  [{id:"accueil",     icon:"🏠", label:"Accueil"},{id:"analyses",    icon:"📊", label:"Analyses"},{id:"alertes",     icon:"🔔", label:"Alertes",badge:1},{id:"partenaires", icon:"🔧", label:"Partenaires"},{id:"reglages",    icon:"⚙️", label:"Réglages"}],
  admin:   [{id:"overview",    icon:"🏠", label:"Vue globale"},{id:"clients",    icon:"👥", label:"Clients"},{id:"analytics",   icon:"📈", label:"Analytics"},{id:"partners",    icon:"🔧", label:"Partenaires"},{id:"settings",    icon:"⚙️", label:"Réglages"}],
  partner: [{id:"demandes",    icon:"📥", label:"Demandes",badge:3},{id:"interventions",icon:"📅", label:"Interventions"},{id:"historique",  icon:"📜", label:"Historique"},{id:"settings",    icon:"⚙️", label:"Réglages"}],
}

export default function App() {
  const [role, setRole]   = useState("client")
  const [page, setPage]   = useState("accueil")
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load dashboard data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Try real API first
      const result = await apiFetch(
        "/api/dashboard/BOUSF_001?lat=33.40&lon=-7.55&capacity_kwp=10&days_since_cleaning=38&cout_nettoyage=800"
      )
      setData(result)
    } catch(_) {
      // Fallback to mock data
      setData({
        date: new Date().toISOString().split("T")[0],
        weather: { irradiation_kwh_m2:6.82, temp_air_c:22.4, humidity_pct:62, wind_speed_ms:3.8, precipitation_mm:0.3 },
        features: { days_since_last_rain:22, power_ratio:0.739, days_since_last_cleaning:38, irradiation_kwh_m2:6.82, temp_air_c:22.4, humidity_pct:62, wind_speed_ms:3.8, precipitation_mm:0.3, p_theoretical_kwh:53.07, installed_capacity_kwp:10 },
        prediction: {
          soiling_m1_calcul:0.261, soiling_m2_ia:0.254, soiling_final:0.257, soiling_pct:25.7,
          gap_m1_m2:0.007, confidence_pct:95, diagnostic:"Accord M1/M2 — haute confiance",
          alert_soiling:"ALERTE", p_theoretical_kwh:53.07, p_real_kwh:39.2, power_ratio:0.739,
          perte_kwh_jour:13.65, perte_dh_jour:16.38, perte_cumulee_dh:622.4, cout_nettoyage_dh:800,
          gain_net_dh:-177.6, rentable:false, jours_break_even:67, jours_restants:11, alerte_nettoyage:"ATTENDRE"
        }
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const switchRole = (r) => {
    setRole(r)
    setPage(NAV[r][0].id)
  }

  const switchPage = (p) => setPage(p)

  const renderPage = () => {
    if (role === "client") {
      if (page === "accueil")     return <ClientDashboard data={data} loading={loading} onContactPartner={() => setPage("partenaires")}/>
      if (page === "partenaires") return <PartnersPage prediction={data?.prediction} onBack={() => setPage("accueil")}/>
    }
    return (
      <div style={{ padding:40, textAlign:"center", color:"#7DA882" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🚧</div>
        <div style={{ fontWeight:600, color:"#162716", marginBottom:6 }}>Page "{page}" — {role}</div>
        <div style={{ fontSize:12.5 }}>Connecter cette page à l'API FastAPI correspondante.</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", fontSize:13.5, lineHeight:1.5, minHeight:"100vh", background:"#F2F7F2", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <header style={{ background:"#14311F", display:"flex", alignItems:"center", padding:"0 16px", height:54, gap:12, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:"#16A34A", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>☀️</div>
          <span style={{ color:"#fff", fontSize:15.5, fontWeight:700 }}>Solar<span style={{ color:"#4ADE80" }}>AI</span></span>
        </div>

        <div style={{ display:"flex", gap:2, margin:"0 auto", background:"rgba(255,255,255,0.12)", padding:3, borderRadius:8 }}>
          {["client","admin","partner"].map((r,i) => (
            <button key={r} onClick={() => switchRole(r)} style={{ padding:"5px 13px", borderRadius:6, color: role===r ? "#fff" : "#fff", opacity: role===r ? 1 : 0.72, fontSize:12.5, fontWeight: role===r ? 700 : 500, cursor:"pointer", border:"none", background: role===r ? "#16A34A" : "transparent", display:"flex", alignItems:"center", gap:5 }}>
              {["👤","🛡","🔧"][i]} {["Client","Admin","Partenaire"][i]}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#4ADE80", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10.5, fontWeight:700, color:"#14311F" }}>{ROLES[role].av}</div>
          <span style={{ color:"#fff", fontSize:12.5, fontWeight:500 }}>{ROLES[role].nm}</span>
        </div>
      </header>

      <div style={{ display:"flex", flex:1 }}>

        {/* Sidebar */}
        <nav style={{ width:196, background:"#14311F", padding:"12px 0", flexShrink:0, display:"flex", flexDirection:"column", borderRight:"0.5px solid rgba(74,222,128,0.08)" }}>
          <div style={{ padding:"0 10px" }}>
            {NAV[role].map(item => (
              <button key={item.id} onClick={() => switchPage(item.id)} style={{ display:"flex", alignItems:"center", gap:9, padding:"7.5px 9px", borderRadius:7, color: page===item.id ? "#4ADE80" : "#fff", opacity: page===item.id ? 1 : 0.78, cursor:"pointer", fontSize:13, fontWeight: page===item.id ? 600 : 400, transition:"all .13s", border:"none", background: page===item.id ? "rgba(74,222,128,0.15)" : "transparent", width:"100%", textAlign:"left", marginBottom:2 }}>
                <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && <span style={{ marginLeft:"auto", background:"#C81E1E", color:"#fff", fontSize:9, fontWeight:700, padding:"1.5px 5.5px", borderRadius:10 }}>{item.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop:"auto", padding:10, borderTop:"0.5px solid rgba(255,255,255,0.07)" }}>
            <div style={{ padding:"5px 9px", fontSize:10, color:"rgba(255,255,255,0.25)", lineHeight:1.7 }}>Solar AI-Optimizer v2.0<br/>Maroc © 2026</div>
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex:1, background:"#F2F7F2", padding:20, overflowY:"auto" }}>
          {renderPage()}
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        button:hover { opacity:0.9; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
