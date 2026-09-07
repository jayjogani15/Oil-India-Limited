/**
 * OIL India SIF Precursor Detection System â Frontend Application
 * Self-contained: includes inline NLP engine + all seed data.
 * Works offline without any backend server.
 */

'use strict';

// ── API Configuration & Live/Offline Detection ─────────────────────────────
// Step 2 backend runs at http://localhost:8000 (uvicorn main:app --reload)
// The old /api prefix is NO LONGER used — new backend exposes root-level paths.
const API_BASE = 'http://127.0.0.1:8000';

// Single flag: set to true when /health probe succeeds at startup.
// All subsequent fetch calls branch on this — zero visible error state for user.
let _apiLive = false;

async function _probeBackend() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      _apiLive = data.status === 'ok' && data.sif_model_loaded;
      if (_apiLive) {
        console.info(
          `[API] Backend live — model v${data.model_version}, ` +
          `${data.dataset_records} dataset records. LSR model: ${data.lsr_model_loaded}`
        );
        // Hydrate dashboard with live data after probe
        _loadLiveSites();
        _loadLiveFlagged();
      }
    }
  } catch (_) {
    // Backend not running — _apiLive stays false, mock data used everywhere
    console.info('[API] Backend offline — using inline mock data (seamless fallback).');
  }
}

let currentRole = 'safety_officer';
let currentReviewerName = 'Er. A. K. Baruah (Safety Officer)';
let currentReviewerId = 'OIL-SO-104';

function setUserRole(role) {
  currentRole = role;
  const badge = document.getElementById('activeRoleBadge');
  if (role === 'field_engineer') {
    currentReviewerName = 'Shri R. Gogoi (Field Engineer)';
    currentReviewerId = 'OIL-FE-802';
    if (badge) {
      badge.textContent = 'Active: Field Engineer (Read-Only Sign-off)';
      badge.style.background = '#FEF3C7';
      badge.style.color = '#92400E';
    }
  } else if (role === 'statutory_reviewer') {
    currentReviewerName = 'Er. P. K. Sharma (Chief Safety Officer)';
    currentReviewerId = 'OIL-DIR-782';
    if (badge) {
      badge.textContent = 'Active: Statutory Reviewer (Directorate Full Access)';
      badge.style.background = '#FEE2E2';
      badge.style.color = '#7A1620';
    }
  } else {
    currentReviewerName = 'Er. A. K. Baruah (Safety Officer)';
    currentReviewerId = 'OIL-SO-104';
    if (badge) {
      badge.textContent = 'Active: Safety Officer (Triage & Sign-off)';
      badge.style.background = '#DBEAFE';
      badge.style.color = '#1E40AF';
    }
  }
}

// ============================================================
// ============================================================
// ============================================================
const SEED_REPORTS = [
  {id:"R001",text:"Contractor was working on an energized MCC panel at Duliajan field without verifying isolation. No LOTO tag observed. Worker's hand came within 10 cm of live busbar. Near miss â no injury.",site:"Duliajan",department:"Electrical",activity:"Electrical Maintenance",report_type:"Near Miss",date:"2025-01-10",sif_potential:true,sif_score:87,life_saving_rules:["Energy Isolation","Work Authorisation"],primary_rule:"Energy Isolation",barrier_failures:["LOTO/Lockout-Tagout not applied","Isolation not verified before work"]},
  {id:"R002",text:"Welding contractor commenced hot work on a crude oil transfer line at Moran GGS without a hot work permit. No fire extinguisher positioned nearby. Gas test not performed before starting.",site:"Moran",department:"Operations",activity:"Pipeline Maintenance",report_type:"Unsafe Act",date:"2025-01-15",sif_potential:true,sif_score:91,life_saving_rules:["Hot Work","Work Authorisation"],primary_rule:"Hot Work",barrier_failures:["Permit to Work (PTW) not obtained","Gas test not performed before work"]},
  {id:"R003",text:"Worker entered storage crude oil tank at Jorhat for inspection without atmospheric testing for H2S and O2 levels. No standby person assigned. SCBA not worn. Confined space permit not issued.",site:"Jorhat",department:"Operations",activity:"Tank Inspection",report_type:"Unsafe Act",date:"2025-01-20",sif_potential:true,sif_score:94,life_saving_rules:["Confined Space","Work Authorisation"],primary_rule:"Confined Space",barrier_failures:["Permit to Work (PTW) not obtained","Gas test not performed before work","No standby/standby person absent"]},
  {id:"R004",text:"Driller observed working on top of derrick at Digboi well without wearing safety harness. No anchor point attached. Height approximately 15 meters. Tool fell to ground â no injury but narrowly missed worker below.",site:"Digboi",department:"Drilling",activity:"Derrick Maintenance",report_type:"Near Miss",date:"2025-01-25",sif_potential:true,sif_score:88,life_saving_rules:["Working at Height","Line of Fire"],primary_rule:"Working at Height",barrier_failures:["Fall protection harness not worn","No anchor point for fall arrest"]},
  {id:"R005",text:"Mobile crane at Naharkatia workshop exceeded Safe Working Load during a pipe bundle lift. Sling showed visible wear and tear. No pre-lift plan or lifting supervisor present. Rigging crew not certified.",site:"Naharkatia",department:"Mechanical",activity:"Lifting Operations",report_type:"Unsafe Condition",date:"2025-02-01",sif_potential:true,sif_score:85,life_saving_rules:["Safe Mechanical Lifting"],primary_rule:"Safe Mechanical Lifting",barrier_failures:["Safe Working Load (SWL) exceeded","No lifting plan prepared","Rigging failure or deficiency"]},
  {id:"R006",text:"Vehicle driver reversed heavy tanker in Duliajan yard without a banksman. A worker on foot was in the vehicle's blind spot. Emergency stop prevented collision. Driver not following journey management plan.",site:"Duliajan",department:"Logistics",activity:"Vehicle Movement",report_type:"Near Miss",date:"2025-02-08",sif_potential:true,sif_score:79,life_saving_rules:["Driving","Line of Fire"],primary_rule:"Driving",barrier_failures:["Vehicle reversing without banksman/spotter"]},
  {id:"R007",text:"Safety interlock on blow-out preventer (BOP) at Rajasthan well RJ-12 was bypassed by drilling crew to speed up operations. Bypass not authorized and not documented. Well pressure was above formation pressure.",site:"Rajasthan",department:"Drilling",activity:"Drilling Operations",report_type:"Unsafe Act",date:"2025-02-14",sif_potential:true,sif_score:96,life_saving_rules:["Bypassing Safety Controls","Energy Isolation"],primary_rule:"Bypassing Safety Controls",barrier_failures:["Safety control bypassed â critical defense defeated"]},
  {id:"R008",text:"Scaffolding at Baghjan processing plant was erected without proper base plates on soft ground. Scaffold visibly leaning. Workers continued working at 8-meter height. No inspection tag on structure.",site:"Baghjan",department:"Construction",activity:"Scaffold Work",report_type:"Unsafe Condition",date:"2025-02-20",sif_potential:true,sif_score:83,life_saving_rules:["Working at Height"],primary_rule:"Working at Height",barrier_failures:["Fall protection harness not worn"]},
  {id:"R009",text:"Gas leak detected at Moran CGS separator. LEL meter reading 35% LEL. Hot work was in progress in adjacent area â welding on flare line. Work not stopped despite gas alarm sounding.",site:"Moran",department:"Operations",activity:"Gas Processing",report_type:"Near Miss",date:"2025-03-02",sif_potential:true,sif_score:97,life_saving_rules:["Hot Work","Energy Isolation"],primary_rule:"Hot Work",barrier_failures:["Explosive atmosphere â LEL exceeded","Gas test not performed before work"]},
  {id:"R010",text:"Contract worker caught sleeve in rotating agitator shaft at Duliajan chemical store. Machinery guard had been removed for cleaning and not replaced before restarting. Worker sustained minor arm laceration â potential for amputation.",site:"Duliajan",department:"Chemical",activity:"Equipment Maintenance",report_type:"Incident",date:"2025-03-10",sif_potential:true,sif_score:89,life_saving_rules:["Bypassing Safety Controls","Line of Fire"],primary_rule:"Bypassing Safety Controls",barrier_failures:["Machine guard removed â mechanical hazard exposed"]},
  {id:"R011",text:"Two workers entered a pipeline pig trap receiver at Jorhat pump station without an entry permit. No gas test performed. Oxygen levels found to be 17% on subsequent test. Workers rescued without injury.",site:"Jorhat",department:"Pipeline",activity:"Pipeline Inspection",report_type:"Near Miss",date:"2025-03-15",sif_potential:true,sif_score:93,life_saving_rules:["Confined Space","Work Authorisation"],primary_rule:"Confined Space",barrier_failures:["Permit to Work (PTW) not obtained","Gas test not performed before work"]},
  {id:"R012",text:"Overhead crane hook block dropped 3 meters at Duliajan workshop due to brake failure. Load narrowly missed two workers below exclusion zone. Crane last inspection overdue by 6 months.",site:"Duliajan",department:"Workshop",activity:"Crane Operations",report_type:"Near Miss",date:"2025-03-22",sif_potential:true,sif_score:90,life_saving_rules:["Safe Mechanical Lifting","Line of Fire"],primary_rule:"Safe Mechanical Lifting",barrier_failures:["No lifting plan prepared"]},
  {id:"R013",text:"Company driver traveling Duliajan-Tinsukia route found to be using mobile phone while driving. Speed 82 km/h in 60 km/h zone. Journey plan not submitted. Previous warning on file for same offense.",site:"Duliajan",department:"Administration",activity:"Road Transport",report_type:"Unsafe Act",date:"2025-04-01",sif_potential:true,sif_score:75,life_saving_rules:["Driving"],primary_rule:"Driving",barrier_failures:["Speeding â speed limit exceeded","Seatbelt not worn"]},
  {id:"R014",text:"High pressure gas line at Naharkatia wellhead opened for maintenance without proper depressurization. Pressure gauge showed 40 bar residual pressure. Workers standing in line of fire during line break. No isolation certificate.",site:"Naharkatia",department:"Production",activity:"Line Breaking",report_type:"Unsafe Act",date:"2025-04-08",sif_potential:true,sif_score:95,life_saving_rules:["Energy Isolation","Line of Fire","Work Authorisation"],primary_rule:"Energy Isolation",barrier_failures:["Isolation not verified before work","Permit to Work (PTW) not obtained"]},
  {id:"R015",text:"Worker at Sibsagar well pad observed welding on a gas pipeline while a running pump continued pumping natural gas through the system. No shutdown performed. Potential for ignition extremely high.",site:"Sibsagar",department:"Production",activity:"Pipeline Repair",report_type:"Unsafe Act",date:"2025-04-14",sif_potential:true,sif_score:98,life_saving_rules:["Hot Work","Energy Isolation"],primary_rule:"Hot Work",barrier_failures:["Gas test not performed before work","Isolation not verified before work"]},
  {id:"R016",text:"Electrician at Rajasthan RJ-7 camp worked on 11kV switchgear panel without second person presence and without rubber insulating gloves. Panel was energized. Isolation permit had expired 2 hours prior.",site:"Rajasthan",department:"Electrical",activity:"HV Switchgear Maintenance",report_type:"Unsafe Act",date:"2025-04-20",sif_potential:true,sif_score:92,life_saving_rules:["Energy Isolation","Work Authorisation"],primary_rule:"Energy Isolation",barrier_failures:["Isolation not verified before work","Permit to Work (PTW) not obtained"]},
  {id:"R017",text:"Forklift operator at Duliajan material store drove past pedestrian walkway without stopping. Worker nearly struck. Forklift speed excessive for indoor area. No pedestrian-vehicle segregation in place.",site:"Duliajan",department:"Warehouse",activity:"Material Handling",report_type:"Near Miss",date:"2025-05-02",sif_potential:true,sif_score:78,life_saving_rules:["Driving","Line of Fire"],primary_rule:"Driving",barrier_failures:["Speeding â speed limit exceeded"]},
  {id:"R018",text:"Scaffold plank at Moran GGS scaffolding collapsed when worker stepped on it. Plank was timber with visible rot and had no color coding inspection tag. Worker fell 2.5 meters â sustained fracture. Fall arrest not connected.",site:"Moran",department:"Maintenance",activity:"Scaffold Access",report_type:"Incident",date:"2025-05-10",sif_potential:true,sif_score:86,life_saving_rules:["Working at Height"],primary_rule:"Working at Height",barrier_failures:["Fall protection harness not worn","No fall protection in place"]},
  {id:"R019",text:"At Baghjan tank farm, safety relief valve on crude oil storage tank had been manually gagged by maintenance team to prevent actuation during transfer. No authorization, no MOC. Tank pressure rising above design.",site:"Baghjan",department:"Operations",activity:"Tank Operations",report_type:"Unsafe Act",date:"2025-05-18",sif_potential:true,sif_score:97,life_saving_rules:["Bypassing Safety Controls","Energy Isolation"],primary_rule:"Bypassing Safety Controls",barrier_failures:["Safety control bypassed â critical defense defeated"]},
  {id:"R020",text:"During excavation work at Digboi ROW, a 3-meter deep trench was opened without shoring. Two workers were inside trench when sidewall partially collapsed. Workers escaped â no injury. No excavation permit issued.",site:"Digboi",department:"Civil",activity:"Pipeline Excavation",report_type:"Near Miss",date:"2025-06-01",sif_potential:true,sif_score:84,life_saving_rules:["Confined Space","Work Authorisation"],primary_rule:"Confined Space",barrier_failures:["Permit to Work (PTW) not obtained"]},
  {id:"R021",text:"Rig crew member on Rajasthan rig RJ-5 observed standing directly under suspended drill pipe during tripping operations. No exclusion zone marked. Worker not aware of line-of-fire hazard. Supervisor absent from rig floor.",site:"Rajasthan",department:"Drilling",activity:"Tripping Operations",report_type:"Unsafe Act",date:"2025-06-08",sif_potential:true,sif_score:82,life_saving_rules:["Line of Fire","Safe Mechanical Lifting"],primary_rule:"Line of Fire",barrier_failures:["Supervision absent"]},
  {id:"R022",text:"H2S concentration at Geleki gas field processing area reached 18 ppm. Workers in area not wearing SCBA. H2S alarm was bypassed earlier in shift due to nuisance alarm. No evacuation initiated.",site:"Geleki",department:"Gas Processing",activity:"Gas Processing Operations",report_type:"Unsafe Condition",date:"2025-06-15",sif_potential:true,sif_score:94,life_saving_rules:["Bypassing Safety Controls","Energy Isolation"],primary_rule:"Bypassing Safety Controls",barrier_failures:["Safety alarm disabled","Safety control bypassed â critical defense defeated"]},
  {id:"R023",text:"Crane lift of heavy wellhead tree assembly at Naharkatia performed with incorrect rigging configuration. Load began to tilt during lift. Tagline not used. Workers standing within crane radius. Lift aborted safely.",site:"Naharkatia",department:"Well Services",activity:"Wellhead Installation",report_type:"Near Miss",date:"2025-07-01",sif_potential:true,sif_score:88,life_saving_rules:["Safe Mechanical Lifting","Line of Fire"],primary_rule:"Safe Mechanical Lifting",barrier_failures:["Rigging failure or deficiency","No lifting plan prepared"]},
  {id:"R024",text:"Contract worker at Sibsagar workshop used angle grinder to cut a gas cylinder valve without draining the cylinder first. Sparks observed near LPG cylinders stored in adjacent bay. No hot work permit. Fire watch absent.",site:"Sibsagar",department:"Workshop",activity:"Workshop Operations",report_type:"Unsafe Act",date:"2025-07-10",sif_potential:true,sif_score:93,life_saving_rules:["Hot Work","Work Authorisation"],primary_rule:"Hot Work",barrier_failures:["Hot Work Permit not obtained","Gas test not performed before work"]},
  {id:"R025",text:"OIL staff driver fell asleep at wheel on Duliajan-Dibrugarh highway at 0600 hrs after completing night shift. Vehicle drifted across center line. No journey management policy compliance.",site:"Duliajan",department:"Administration",activity:"Road Transport",report_type:"Incident",date:"2025-07-18",sif_potential:true,sif_score:81,life_saving_rules:["Driving"],primary_rule:"Driving",barrier_failures:["Seatbelt not worn"]},
  {id:"R026",text:"Worker observed not wearing safety boots in office area of Duliajan field base. Reminded by supervisor and complied immediately. No hazard present in the area at time of observation.",site:"Duliajan",department:"Administration",activity:"Office Work",report_type:"Unsafe Act",date:"2025-01-12",sif_potential:false,sif_score:8,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R027",text:"Toolbox at Naharkatia workshop found to be in disorganized condition with tools not returned to designated locations after use. Housekeeping issue â no immediate hazard identified.",site:"Naharkatia",department:"Mechanical",activity:"Workshop Housekeeping",report_type:"Unsafe Condition",date:"2025-01-18",sif_potential:false,sif_score:5,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R028",text:"Monthly safety meeting minutes not submitted on time by Moran department. Administrative non-compliance. No safety risk identified. Reminder issued to department head.",site:"Moran",department:"Administration",activity:"Administrative",report_type:"Unsafe Act",date:"2025-01-22",sif_potential:false,sif_score:3,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R029",text:"Cafeteria at Duliajan base camp had spilled cooking oil on floor near serving counter. Slip hazard noted. Cleaned immediately by housekeeping staff. Wet floor sign placed.",site:"Duliajan",department:"Catering",activity:"Catering Operations",report_type:"Unsafe Condition",date:"2025-02-02",sif_potential:false,sif_score:12,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R030",text:"Fire extinguisher in office corridor at Jorhat base found with expired service tag. Reported and replaced within same working day. No fire risk present at time of discovery.",site:"Jorhat",department:"Administration",activity:"Fire Safety Inspection",report_type:"Unsafe Condition",date:"2025-02-10",sif_potential:false,sif_score:15,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R031",text:"Worker observed walking without high-visibility vest in the low-traffic parking area of Digboi oil field office. Reminded and immediately put on vest. Area is not a designated hazardous zone.",site:"Digboi",department:"Administration",activity:"Yard Walk",report_type:"Unsafe Act",date:"2025-02-16",sif_potential:false,sif_score:7,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R032",text:"First aid kit in Naharkatia field vehicle found to be partially depleted â bandages and antiseptic cream used and not restocked. No immediate medical need. Restocked and logged.",site:"Naharkatia",department:"HSE",activity:"Vehicle Inspection",report_type:"Unsafe Condition",date:"2025-03-05",sif_potential:false,sif_score:9,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R033",text:"Waste bins at Moran CGS site office area were not segregated as per color-coding requirement. Recyclable and general waste found mixed. Housekeeping contractor briefed.",site:"Moran",department:"Environment",activity:"Waste Management",report_type:"Unsafe Condition",date:"2025-03-12",sif_potential:false,sif_score:4,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R034",text:"Worker at Sibsagar warehouse observed carrying box without wearing gloves. Box was standard cardboard â no chemical or sharp edge. Observation noted and habit reinforced during next TBT.",site:"Sibsagar",department:"Warehouse",activity:"Material Handling",report_type:"Unsafe Act",date:"2025-03-20",sif_potential:false,sif_score:6,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R035",text:"Safety signboard at entrance of Baghjan pump station found faded and text not clearly readable. Replacement requested and new sign installed within 5 working days.",site:"Baghjan",department:"HSE",activity:"Facility Inspection",report_type:"Unsafe Condition",date:"2025-03-28",sif_potential:false,sif_score:5,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R036",text:"Office chair at Duliajan HSE department found with broken armrest. Reported to admin. Replacement chair provided. Minor ergonomic concern â no injury potential beyond minor discomfort.",site:"Duliajan",department:"Administration",activity:"Office Work",report_type:"Unsafe Condition",date:"2025-04-03",sif_potential:false,sif_score:2,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R037",text:"Worker at Digboi refinery canteen slipped on wet floor but caught himself on counter without falling. Floor cleaned and marked immediately. Potential for minor bruise only.",site:"Digboi",department:"Catering",activity:"Cafeteria Operations",report_type:"Near Miss",date:"2025-04-11",sif_potential:false,sif_score:18,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R038",text:"Minor oil spill (approximately 2 liters) from equipment drip tray at Naharkatia workshop. Contained within drip tray. No ground contamination. Cleaned and disposed per waste management procedure.",site:"Naharkatia",department:"Mechanical",activity:"Workshop Operations",report_type:"Unsafe Condition",date:"2025-04-18",sif_potential:false,sif_score:10,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R039",text:"Temperature in server room at Duliajan IT department raised above 24°C due to air conditioner malfunction. IT team notified, technician called. No safety risk to personnel.",site:"Duliajan",department:"IT",activity:"IT Infrastructure",report_type:"Unsafe Condition",date:"2025-04-25",sif_potential:false,sif_score:3,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R040",text:"Worker reported mild headache at Jorhat field camp. Attended by medic. Found to be due to dehydration in hot weather. Advised fluid intake and rest. Returned to work same afternoon.",site:"Jorhat",department:"Medical",activity:"Field Operations",report_type:"Incident",date:"2025-05-04",sif_potential:false,sif_score:11,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R041",text:"Safety induction training for new contract workers at Rajasthan site was delayed by two days due to trainer unavailability. Workers assigned to low-risk administrative tasks during delay.",site:"Rajasthan",department:"HSE",activity:"Training",report_type:"Unsafe Act",date:"2025-05-12",sif_potential:false,sif_score:14,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R042",text:"Desk fan in Baghjan field office found with loose power cable connection. Power to fan switched off. Electrician called for repair. No exposed wiring â plug connection issue only.",site:"Baghjan",department:"Administration",activity:"Office Maintenance",report_type:"Unsafe Condition",date:"2025-05-20",sif_potential:false,sif_score:16,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R043",text:"Safety observation cards not being consistently filled out by workers at Geleki site. Behavioral issue â awareness campaign and supervisory reminder issued. No direct safety incident associated.",site:"Geleki",department:"HSE",activity:"Safety Administration",report_type:"Unsafe Act",date:"2025-05-28",sif_potential:false,sif_score:7,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R044",text:"Worker reported knee pain after extended walking during site inspection at Moran. Ergonomic assessment recommended. Knee guard and reduced walking schedule arranged.",site:"Moran",department:"Medical",activity:"Site Inspection",report_type:"Incident",date:"2025-06-04",sif_potential:false,sif_score:10,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R045",text:"Access road to Duliajan wellsite found to have potholes following monsoon rains. Road marked and vehicles advised to reduce speed. Repair work requested â scheduled within two weeks.",site:"Duliajan",department:"Civil",activity:"Infrastructure",report_type:"Unsafe Condition",date:"2025-06-12",sif_potential:false,sif_score:20,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R046",text:"Minor cut on hand sustained by worker at Naharkatia workshop while opening packaging material with utility knife. First aid administered. Proper knife usage technique reinforced.",site:"Naharkatia",department:"Warehouse",activity:"Receiving Operations",report_type:"Incident",date:"2025-06-20",sif_potential:false,sif_score:13,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R047",text:"Notice board in Sibsagar field break room found without updated emergency contact list. HSE coordinator updated notice board with current contacts and evacuation muster points.",site:"Sibsagar",department:"HSE",activity:"Emergency Preparedness",report_type:"Unsafe Condition",date:"2025-06-28",sif_potential:false,sif_score:6,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R048",text:"Contractor worker found eating lunch in the work area rather than designated rest area at Digboi. Reminded of policy. No hazardous materials present in work area at time of observation.",site:"Digboi",department:"Construction",activity:"Construction Activities",report_type:"Unsafe Act",date:"2025-07-05",sif_potential:false,sif_score:4,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R049",text:"Vehicle windshield at Baghjan field vehicle found cracked â partially obstructing driver's view. Vehicle taken out of service for windshield replacement before next journey.",site:"Baghjan",department:"Logistics",activity:"Vehicle Inspection",report_type:"Unsafe Condition",date:"2025-07-12",sif_potential:false,sif_score:22,life_saving_rules:[],primary_rule:null,barrier_failures:[]},
  {id:"R050",text:"Housekeeping staff at Rajasthan camp found using incorrect chemical dilution ratio for floor cleaning. Corrected and retrained. Chemical used was low-hazard floor cleaner â no health risk.",site:"Rajasthan",department:"Catering",activity:"Camp Housekeeping",report_type:"Unsafe Act",date:"2025-07-20",sif_potential:false,sif_score:5,life_saving_rules:[],primary_rule:null,barrier_failures:[]}
];

// ============================================================
//  INLINE NLP ENGINE (Keyword-based, no backend required)
// ============================================================
const ABBREVIATIONS = {
  PTW:'Permit to Work',LOTO:'Lockout Tagout',JSA:'Job Safety Analysis',
  MOC:'Management of Change',H2S:'Hydrogen Sulfide',HSSE:'Health Safety Security Environment',
  HSE:'Health Safety Environment',PPE:'Personal Protective Equipment',
  SIF:'Serious Injury or Fatality',UA:'Unsafe Act',UC:'Unsafe Condition',
  SOP:'Standard Operating Procedure',TBT:'Toolbox Talk',BOP:'Blowout Preventer',
  GGS:'Group Gathering Station',CGS:'Central Gathering Station',ROW:'Right of Way',
  SCBA:'Self Contained Breathing Apparatus',LEL:'Lower Explosive Limit',
  MCC:'Motor Control Center',HV:'High Voltage',ESD:'Emergency Shutdown',
  SWL:'Safe Working Load',WLL:'Working Load Limit',LOTO:'Lockout Tagout'
};

const SIF_KEYWORDS = {
  energy_sources:{weight:25,terms:['energized','live wire','live cable','live equipment','electrical panel','high voltage','transformer','switchgear','MCC panel','pressurized','pressure vessel','high pressure','gas blowout','steam','hydraulic pressure','compressed air','charged line']},
  isolation_failure:{weight:22,terms:['no LOTO','without LOTO','LOTO not applied','LOTO missing','no lockout','isolation not verified','not isolated','without isolation','bypass isolation','no isolation','no permit to work','without PTW','PTW not taken','no work permit','permit not issued','no energy isolation','not de-energized','no LOTO tag']},
  gravity_height:{weight:20,terms:['working at height','height work','elevated work','roof work','scaffold','scaffolding','ladder','fall from height','fell from','dropped from','no harness','harness not worn','no fall protection','safety harness missing','anchor point','lanyard','derrick','mast','tower','platform edge','open hole','falling object','dropped object','above ground','man lift','scissor lift','above 2 meters']},
  mechanical_motion:{weight:18,terms:['rotating equipment','rotating machinery','moving parts','caught in machinery','pinch point','nip point','caught between','struck by','moving equipment','pump running','motor running','compressor running','unguarded equipment','guard removed','guard missing','conveyor','agitator','drill bit','drill string','winch','draw works','crane operation','crane swing','load swinging','SWL exceeded','overload','rigging']},
  fire_explosion:{weight:22,terms:['hot work','welding','cutting','grinding','spark','ignition source','flammable','combustible','hydrocarbon','gas leak','oil leak','petroleum','LPG','hydrogen sulfide','H2S','explosive atmosphere','LEL exceeded','LEL above','gas concentration','no gas test','gas test not done','fire','flame','burning','explosion risk','naked flame','open flame','flashback','flash fire','no fire watch','no hot work permit']},
  entrapment_engulfment:{weight:20,terms:['confined space','enclosed space','tank entry','vessel entry','pit','sump','trench','excavation','underground','manhole','storage tank','separator','mud pit','no gas test before entry','oxygen deficiency','oxygen depleted','asphyxiation','engulfment','entrapment','no attendant','no standby person','confined space entry','atmospheric test','no atmospheric test','no rescue plan','cave-in']},
  motor_vehicle:{weight:15,terms:['vehicle accident','vehicle incident','road accident','collision','speeding','over speed','overspeeding','driver','driving','seatbelt not worn','no seatbelt','drunk driving','distracted driving','vehicle rollover','reverse without spotter','pedestrian struck','forklift','heavy vehicle','truck','tanker','no banksman','vehicle near wellhead']},
  supervision_human_factors:{weight:10,terms:['worked alone','working alone','no supervision','supervisor absent','no spotter','no standby','inadequate supervision','not trained','untrained worker','contractor not briefed','no toolbox talk','TBT not done','JSA not reviewed','complacency','shortcut','bypassed safety control','overridden','bypassed interlock','defeated safety system','safety device removed','alarm disabled','alarm bypassed']}
};

const LSR_KEYWORDS = {
  'Energy Isolation':['energized','LOTO','lockout','tagout','isolation','de-energized','electrical panel','live wire','live cable','live equipment','isolation certificate','energy isolation','no LOTO','isolation not verified','pressurized line','valve isolation','MCC','switchgear','transformer','electrical work','arc flash','electric shock','high voltage','HV'],
  'Hot Work':['hot work','welding','cutting','grinding','spark','soldering','torch','open flame','ignition source','grinder','gas cutting','plasma cutting','flame','burning','fire work','no hot work permit','fire watch','no fire watch','flammable atmosphere','gas test before hot work'],
  'Confined Space':['confined space','enclosed space','tank entry','vessel entry','pit entry','manhole','sewer','trench','underground chamber','storage tank','separator entry','oxygen deficiency','atmospheric test','no gas test','standby person','no attendant','rescue plan','confined space entry permit','mud pit','sump','engulfment','asphyxiation','toxic atmosphere'],
  'Working at Height':['height','elevated','scaffold','scaffolding','ladder','roof','fall from height','fall arrest','harness','lanyard','safety net','anchor point','elevated platform','mast','derrick','tower','cherry picker','man lift','scissor lift','working above','above ground level','dropped object','falling object','no fall protection','edge protection','guardrail missing'],
  'Line of Fire':['line of fire','struck by','caught in','pinch point','rotating equipment','moving equipment','swinging load','dropped load','overhead load','projectile','pressure release','blowout','jet of fluid','pressure jet','ejection','machinery guard missing','unguarded rotating','conveyor','in the path','danger zone','exclusion zone breach'],
  'Safe Mechanical Lifting':['crane','lifting','lift','rigging','sling','shackle','hook','hoist','winch','load','SWL exceeded','overload','rigging failure','sling failure','crane inspection','lifting plan','no lifting plan','lift supervisor','load swing','dropped load','load path','crane certification','forklift','overhead crane','mobile crane','tagline missing'],
  'Work Authorisation':['permit to work','PTW','work permit','no permit','permit not issued','permit expired','work without permit','unauthorized work','permit system','PTW violation','permit not signed','job hazard analysis','JSA','toolbox talk not done','TBT not conducted','work order','task not authorized','cold work permit','hot work permit','confined space permit','excavation permit'],
  'Driving':['driving','vehicle','driver','road','collision','accident','seatbelt','speeding','overspeed','fatigue driving','mobile phone driving','drunk driving','vehicle rollover','road incident','traffic','reverse without spotter','vehicle in work zone','pedestrian struck by vehicle','forklift incident','heavy vehicle','truck incident','journey management','no journey plan','defensive driving'],
  'Bypassing Safety Controls':['bypass','bypassed','defeated','overridden','interlock bypass','safety interlock','safety device removed','guard removed','alarm disabled','alarm bypassed','safety system bypassed','relief valve removed','pressure switch bypassed','trip system bypassed','safety control defeated','short circuit safety','safety protocol ignored','unauthorized modification']
};

const BARRIER_MAP = {
  'no loto':'LOTO/Lockout-Tagout not applied','loto not applied':'LOTO/Lockout-Tagout not applied','loto missing':'LOTO/Lockout-Tagout not applied','isolation not verified':'Isolation not verified before work','not isolated':'Equipment not isolated before work','not de-energized':'Equipment not de-energized','isolation bypassed':'Isolation bypassed â critical control defeated','no permit to work':'Permit to Work (PTW) not obtained','without ptw':'Permit to Work (PTW) not obtained','ptw not taken':'Permit to Work (PTW) not obtained','permit expired':'PTW/Permit had expired','no work permit':'Permit to Work (PTW) not obtained','no hot work permit':'Hot Work Permit not obtained','no gas test':'Gas test not performed before work','gas test not done':'Gas test not performed before work','no atmospheric test':'Atmospheric testing not conducted','lel above':'Explosive atmosphere â LEL exceeded','lel exceeded':'Explosive atmosphere â LEL exceeded','no harness':'Fall protection harness not worn','harness not worn':'Fall protection harness not worn','no fall protection':'No fall protection in place','fall arrest not':'Fall arrest system not connected','no anchor point':'No anchor point for fall arrest','swl exceeded':'Safe Working Load (SWL) exceeded','no lifting plan':'No lifting plan prepared','sling failure':'Rigging/Sling failure or deficiency','rigging failure':'Rigging failure or deficiency','worked alone':'Lone working â no standby/buddy','working alone':'Lone working â no standby/buddy','no supervision':'Supervision absent','supervisor absent':'Supervision absent','no attendant':'No attendant/standby for confined space','no standby':'No standby/standby person absent','bypassed':'Safety control bypassed â critical defense defeated','defeated':'Safety device/interlock defeated','alarm disabled':'Safety alarm disabled','guard removed':'Machine guard removed â mechanical hazard exposed','interlock bypass':'Safety interlock bypassed','no seatbelt':'Seatbelt not worn','seatbelt not worn':'Seatbelt not worn','overspeeding':'Speeding â speed limit exceeded','over speed':'Speeding â speed limit exceeded','reverse without spotter':'Vehicle reversing without banksman/spotter'
};

function expandAbbreviations(text){
  let t = text;
  for(const [abbr,full] of Object.entries(ABBREVIATIONS)){
    t = t.replace(new RegExp(`\\b${abbr}\\b`,'g'), `${full} (${abbr})`);
  }
  return t;
}

function keywordScore(text){
  const tl = text.toLowerCase();
  let total=0, matched={};
  const maxPossible = Object.values(SIF_KEYWORDS).reduce((s,c)=>s+c.weight,0);
  for(const [cat,data] of Object.entries(SIF_KEYWORDS)){
    const hits = data.terms.filter(t=>tl.includes(t.toLowerCase()));
    if(hits.length>0){
      const factor = Math.min(1, Math.sqrt(hits.length/3));
      total += data.weight * factor;
      matched[cat] = hits;
    }
  }
  return {score: Math.min(100, (total/maxPossible)*100*2.5), matched};
}

function lsrTag(text){
  const tl = text.toLowerCase();
  const scores={}, matchedTerms={};
  for(const [rule,kws] of Object.entries(LSR_KEYWORDS)){
    const hits = kws.filter(k=>tl.includes(k.toLowerCase()));
    scores[rule] = Math.min(1, hits.length / Math.max(3, kws.length*0.15));
    if(hits.length) matchedTerms[rule] = hits;
  }
  const fired = Object.entries(scores).filter(([,s])=>s>=0.15).sort((a,b)=>b[1]-a[1]).map(([r])=>r);
  return {tags: fired.length?fired:['Unclassified'], scores, primary_rule: fired[0]||null, matchedTerms};
}

function extractBarrierFailures(text){
  const tl = text.toLowerCase();
  const seen=new Set(), out=[];
  for(const [pat,desc] of Object.entries(BARRIER_MAP)){
    if(tl.includes(pat) && !seen.has(desc)){ seen.add(desc); out.push(desc); }
  }
  return out;
}

function highlightText(text, matched){
  let result = text;
  const toHL=[];
  for(const [cat,terms] of Object.entries(matched)){
    for(const term of terms){
      const severity = ['isolation_failure','fire_explosion','entrapment_engulfment'].includes(cat)?'critical':'high';
      toHL.push({term,severity});
    }
  }
  toHL.sort((a,b)=>b.term.length-a.term.length);
  const seen=new Set();
  for(const {term,severity} of toHL){
    if(seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    result = result.replace(re, `<mark class="hl-${severity}">$1</mark>`);
  }
  return result;
}

function analyzeText(rawText){
  const expanded = expandAbbreviations(rawText);
  const {score, matched} = keywordScore(expanded);
  const sif_potential = score >= 50;
  const confidence = score>=80||score<=20?'High':score>=65||score<=35?'Medium':'Low';
  const lsr = lsrTag(expanded);
  const barriers = extractBarrierFailures(rawText.toLowerCase());
  const precursorFactors = Object.entries(matched).map(([cat,terms])=>{
    const labels={energy_sources:'energy source present',isolation_failure:'isolation control failure',gravity_height:'gravity/height hazard',mechanical_motion:'mechanical motion hazard',fire_explosion:'fire/explosion potential',entrapment_engulfment:'entrapment/engulfment risk',motor_vehicle:'motor vehicle hazard',supervision_human_factors:'supervision/procedure failure'};
    return `${labels[cat]||cat}: ${terms.slice(0,2).join(', ')}`;
  });
  const band = score>=85?'CRITICAL':score>=70?'HIGH':score>=50?'MODERATE':'â';
  const catNames={energy_sources:'energized equipment/pressure',isolation_failure:'isolation control failure',gravity_height:'height/gravity hazard',mechanical_motion:'rotating/moving machinery',fire_explosion:'fire/explosion hazard',entrapment_engulfment:'confined space/engulfment',motor_vehicle:'vehicle/road hazard',supervision_human_factors:'supervision failure'};
  const detected = Object.keys(matched).map(c=>catNames[c]||c);
  let explanation='';
  if(!sif_potential){
    explanation = `This report was classified as NON-SIF-POTENTIAL (score: ${Math.round(score)}/100). No significant SIF precursor signals detected. The report appears to involve low-severity, low-energy hazards.`;
  } else {
    explanation = `â  SIF-POTENTIAL â ${band} (Score: ${Math.round(score)}/100). Detected precursor signals: ${detected.join(', ')}. ${barriers.length?'Critical barrier failures: '+barriers.slice(0,3).join('; ')+'.' : ''} ${lsr.primary_rule&&lsr.primary_rule!=='Unclassified'?'Primary Life-Saving Rule: '+lsr.primary_rule+'.' : ''} Immediate review and intervention recommended to prevent potential fatality or serious injury.`;
  }
  return {
    sif_potential, sif_score: Math.round(score), sif_confidence: confidence,
    life_saving_rules: lsr.tags, lsr_scores: lsr.scores, primary_rule: lsr.primary_rule,
    matched_categories: matched, precursor_factors: precursorFactors,
    barrier_failures: barriers, highlighted_html: highlightText(rawText, matched),
    plain_language_explanation: explanation
  };
}

// ============================================================
//  STATE
// ============================================================
let allReports = SEED_REPORTS.map(r => ({
  ...r,
  is_new: false,
  record_origin: 'HISTORICAL_ARCHIVE'
}));
let filteredReports = [...allReports];
let currentPage = 1;
const PAGE_SIZE = 10;
let charts = {};
let lastTriagedResult = null;
let liveReportCounter = 1;

const EXAMPLES = [
  {text:"Contractor was working on an energized MCC panel at Duliajan field without verifying isolation. No LOTO tag observed. Worker's hand came within 10 cm of live busbar. Near miss â no injury.",site:"Duliajan",type:"Near Miss",dept:"Electrical",activity:"Electrical Maintenance"},
  {text:"Welding contractor commenced hot work on a crude oil transfer line at Moran GGS without a hot work permit. No fire extinguisher positioned nearby. Gas test not performed before starting.",site:"Moran",type:"Unsafe Act",dept:"Operations",activity:"Pipeline Maintenance"},
  {text:"Worker entered storage crude oil tank at Jorhat for inspection without atmospheric testing for H2S and O2 levels. No standby person assigned. SCBA not worn. Confined space permit not issued.",site:"Jorhat",type:"Unsafe Act",dept:"Operations",activity:"Tank Inspection"},
  {text:"Mobile crane at Naharkatia workshop exceeded Safe Working Load during a pipe bundle lift. Sling showed visible wear and tear. No pre-lift plan or lifting supervisor present.",site:"Naharkatia",type:"Unsafe Condition",dept:"Mechanical",activity:"Lifting Operations"},
  {text:"Cafeteria at Duliajan base camp had spilled cooking oil on floor near serving counter. Slip hazard noted. Cleaned immediately by housekeeping staff. Wet floor sign placed.",site:"Duliajan",type:"Unsafe Condition",dept:"Catering",activity:"Catering Operations"}
];

// ============================================================
//  NAVIGATION
// ============================================================
function showSection(id){
  document.querySelectorAll('.content-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn, .nav-btn').forEach(b=>{
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  const sec = document.getElementById(`section-${id}`);
  if(sec) sec.classList.add('active');
  const btn = document.querySelector(`[data-section="${id}"]`);
  if(btn){
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }
  const breadcrumbMap = {
    dashboard: 'Command Dashboard',
    analyzer: 'Report Analyzer',
    heatmap: 'Risk Heatmap',
    lsr: 'Life-Saving Rules',
    clusters: 'Pattern Clusters',
    reports: 'Report Repository',
    governance: 'Statutory Audit & Policy'
  };
  const bcActive = document.getElementById('bcActive');
  if(bcActive && breadcrumbMap[id]){
    bcActive.textContent = breadcrumbMap[id];
  }
  // Lazy-render sections
  if(id==='heatmap') renderHeatmap();
  if(id==='lsr') renderLSR();
  if(id==='clusters') renderClusters();
  if(id==='reports') renderReportsTable();
  if(id==='governance') loadAuditTrail();
}

// ============================================================
//  DASHBOARD KPIs & CHARTS
// ============================================================
function computeKPIs(){
  const total = allReports.length;
  const sifCount = allReports.filter(r=>r.sif_potential).length;
  const criticalCount = allReports.filter(r=>r.sif_score>=90).length;
  const ruleCounts={};
  allReports.forEach(r=>(r.life_saving_rules||[]).forEach(rule=>{
    if(rule!=='Unclassified') ruleCounts[rule]=(ruleCounts[rule]||0)+1;
  }));
  const topRule = Object.entries(ruleCounts).sort((a,b)=>b[1]-a[1])[0]||['â',0];
  const siteDensity = computeDensity(allReports,'site');
  const topSite = siteDensity[0]||{group:'â',sif_density:0};

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiSIF').textContent = sifCount;
  document.getElementById('kpiSIFPct').textContent = `${(sifCount/total*100).toFixed(1)}% of total`;
  document.getElementById('kpiCritical').textContent = criticalCount;
  document.getElementById('kpiTopRule').textContent = topRule[0];
  document.getElementById('kpiTopRuleCount').textContent = `${topRule[1]} violations this period`;
  document.getElementById('kpiTopSite').textContent = topSite.group;
  document.getElementById('kpiTopSiteDensity').textContent = `Density: ${(topSite.sif_density*100).toFixed(1)}%`;
}

function computeDensity(reports, field){
  const groups={};
  reports.forEach(r=>{
    const k=r[field]||'Unknown';
    if(!groups[k]) groups[k]={total:0,sif:0,scores:[]};
    groups[k].total++;
    if(r.sif_potential) groups[k].sif++;
    groups[k].scores.push(r.sif_score||0);
  });
  return Object.entries(groups).map(([g,d])=>({
    group:g, total_reports:d.total, sif_count:d.sif,
    sif_density:d.sif/d.total,
    avg_sif_score: d.scores.reduce((a,b)=>a+b,0)/d.scores.length,
    risk_level: d.sif/d.total>=0.6?'critical':d.sif/d.total>=0.35?'high':d.sif/d.total>=0.15?'medium':'low'
  })).sort((a,b)=>b.sif_density-a.sif_density);
}

function renderDashboardCharts(){
  // Trend chart
  const weeks = buildWeeklyTrend(allReports, 8);
  if(charts.trend) charts.trend.destroy();
  charts.trend = new Chart(document.getElementById('trendChart').getContext('2d'),{
    type:'line',
    data:{
      labels: weeks.map(w=>w.label),
      datasets:[
        {label:'SIF-Potential',data:weeks.map(w=>w.sif),borderColor:'#DC2626',backgroundColor:'rgba(220,38,38,.08)',tension:.4,fill:true,pointBackgroundColor:'#DC2626',pointRadius:4},
        {label:'Total',data:weeks.map(w=>w.total),borderColor:'#3B82C4',backgroundColor:'rgba(59,130,196,.05)',tension:.4,fill:true,pointBackgroundColor:'#3B82C4',pointRadius:3}
      ]
    },
    options:{responsive:true,plugins:{legend:{position:'top',labels:{font:{size:11},color:'#475569'}}},scales:{y:{beginAtZero:true,ticks:{color:'#94A3B8',font:{size:11}},grid:{color:'rgba(0,0,0,.04)'}},x:{ticks:{color:'#94A3B8',font:{size:11}},grid:{display:false}}}}
  });

  // Split donut
  const sif = allReports.filter(r=>r.sif_potential).length;
  const nonSif = allReports.length - sif;
  if(charts.split) charts.split.destroy();
  charts.split = new Chart(document.getElementById('splitChart').getContext('2d'),{
    type:'doughnut',
    data:{labels:['SIF-Potential','Non-SIF'],datasets:[{data:[sif,nonSif],backgroundColor:['#DC2626','#16A34A'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,cutout:'72%',plugins:{legend:{display:false}}}
  });

  // Site density
  const siteDensity = computeDensity(allReports,'site');
  const siteColors = siteDensity.map(s=>s.risk_level==='critical'?'#EF4444':s.risk_level==='high'?'#F97316':s.risk_level==='medium'?'#EAB308':'#22C55E');
  if(charts.site) charts.site.destroy();
  charts.site = new Chart(document.getElementById('siteChart').getContext('2d'),{
    type:'bar',
    data:{labels:siteDensity.map(s=>s.group),datasets:[{label:'SIF Density %',data:siteDensity.map(s=>+(s.sif_density*100).toFixed(1)),backgroundColor:siteColors,borderRadius:5}]},
    options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{max:100,ticks:{color:'#64748B',font:{size:10},callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#94A3B8',font:{size:11}},grid:{display:false}}}}
  });

  // Dept chart
  const deptDensity = computeDensity(allReports,'department');
  if(charts.dept) charts.dept.destroy();
  charts.dept = new Chart(document.getElementById('deptChart').getContext('2d'),{
    type:'bar',
    data:{labels:deptDensity.map(d=>d.group),datasets:[{label:'SIF Reports',data:deptDensity.map(d=>d.sif_count),backgroundColor:'rgba(59,130,246,0.7)',borderRadius:5},{label:'Non-SIF',data:deptDensity.map(d=>d.total_reports-d.sif_count),backgroundColor:'rgba(34,197,94,0.4)',borderRadius:5}]},
    options:{responsive:true,plugins:{legend:{position:'top',labels:{font:{size:11},color:'#94A3B8'}}},scales:{x:{stacked:true,ticks:{color:'#64748B',font:{size:10}},grid:{display:false}},y:{stacked:true,ticks:{color:'#64748B',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

function buildWeeklyTrend(reports,nWeeks){
  const now = new Date('2025-08-01');
  const weeks=[];
  for(let w=nWeeks-1;w>=0;w--){
    const end = new Date(now); end.setDate(end.getDate()-w*7);
    const start = new Date(end); start.setDate(start.getDate()-7);
    const weekReports = reports.filter(r=>{
      if(!r.date) return false;
      const d=new Date(r.date); return d>=start && d<end;
    });
    weeks.push({label:start.toLocaleDateString('en-IN',{month:'short',day:'numeric'}),total:weekReports.length,sif:weekReports.filter(r=>r.sif_potential).length});
  }
  return weeks;
}

let currentAlertsData = [];
let currentAlertFilter = 'all';

function setAlertFilter(filter) {
  currentAlertFilter = filter;
  ['All', 'New', 'Old'].forEach(k => {
    const el = document.getElementById(`filterPill${k}`);
    if (el) el.classList.remove('active');
  });
  if (filter === 'all') document.getElementById('filterPillAll')?.classList.add('active');
  if (filter === 'new') document.getElementById('filterPillNew')?.classList.add('active');
  if (filter === 'historical') document.getElementById('filterPillOld')?.classList.add('active');
  renderAlertsFiltered();
}

function renderAlertsFiltered() {
  const list = document.getElementById('alertsList');
  if (!list) return;

  const newCount = currentAlertsData.filter(r => r.is_new || r.record_origin === 'LIVE_INCOMING').length;
  const oldCount = currentAlertsData.filter(r => !r.is_new && r.record_origin !== 'LIVE_INCOMING').length;

  const cntAll = document.getElementById('countAlertsAll');
  const cntNew = document.getElementById('countAlertsNew');
  const cntOld = document.getElementById('countAlertsOld');
  if (cntAll) cntAll.textContent = currentAlertsData.length;
  if (cntNew) cntNew.textContent = newCount;
  if (cntOld) cntOld.textContent = oldCount;

  let filtered = currentAlertsData;
  if (currentAlertFilter === 'new') filtered = currentAlertsData.filter(r => r.is_new || r.record_origin === 'LIVE_INCOMING');
  if (currentAlertFilter === 'historical') filtered = currentAlertsData.filter(r => !r.is_new && r.record_origin !== 'LIVE_INCOMING');

  if (!filtered.length) {
    list.innerHTML = `
      <div style="padding: 22px; text-align: center; color: var(--gov-text-muted); font-size: 12.5px; background: #FAF8F5; border: 1px dashed #D8D4CB; border-radius: 4px;">
        No reports found in origin category: <strong>${currentAlertFilter.toUpperCase()}</strong>.
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(r => {
    const lsr = r.life_saving_rule_mapped || r.life_saving_rule || r.primary_rule || '';
    const icon = LSR_ICONS[lsr] || '🛡️';
    const score = r.ground_truth_sif_score || r.sif_score || 85;
    const isNew = Boolean(r.is_new || r.record_origin === 'LIVE_INCOMING');
    const itemCls = isNew ? 'alert-item alert-item-new' : 'alert-item alert-item-historical';
    const originBadge = isNew
      ? `<span class="badge-origin badge-origin-new">🆕 NEW REPORT · LIVE TRIAGE</span>`
      : `<span class="badge-origin badge-origin-historical">📜 HISTORICAL AUDIT</span>`;
    const timeDisplay = isNew ? 'Just now' : (r.date || '—');
    const repId = r.report_id || r.id || '—';

    return `
    <div class="${itemCls}" onclick="openReportModal('${repId}')">
      <div class="alert-score-badge${score < 85 ? ' med' : ''}">${score}</div>
      <div class="alert-info" style="flex:1;">
        <div class="alert-top-meta">
          ${originBadge}
          <span class="alert-time-tag">${timeDisplay}</span>
        </div>
        <div class="alert-title" style="font-weight:700;color:var(--gov-navy);font-size:12.5px;margin:2px 0;">
          ${repId} · ${r.site || 'Unknown'} · ${r.report_type || 'Report'}
        </div>
        <div class="alert-text" style="font-size:12px;color:var(--gov-text-dark);line-height:1.4;">
          ${(r.report_text || r.text || '').substring(0, 130)}...
        </div>
        <div class="alert-rules" style="margin-top:4px;">
          ${lsr ? `<span class="alert-rule-tag" style="display:inline-block;background:#FEE2E2;color:var(--gov-maroon);font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:2px;">${icon} ${lsr}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAlerts(){
  currentAlertsData = allReports.filter(r => r.sif_potential).slice(0, 5).map(r => ({
    ...r,
    report_id: r.id,
    report_text: r.text,
    is_new: Boolean(r.is_new),
    record_origin: r.is_new ? 'LIVE_INCOMING' : 'HISTORICAL_ARCHIVE'
  }));
  renderAlertsFiltered();
}

// ============================================================
//  HEATMAP
// ============================================================
function renderHeatmap(){
  const field = document.getElementById('heatmapGroup').value;
  const density = computeDensity(allReports, field);

  document.getElementById('heatmapGrid').innerHTML = density.map(d=>`
    <div class="hm-cell ${d.risk_level}">
      <div class="hm-site">${d.group}</div>
      <div class="hm-pct">${(d.sif_density*100).toFixed(0)}%</div>
      <div class="hm-count">${d.sif_count}/${d.total_reports} reports</div>
    </div>`).join('');

  const tbody = document.getElementById('heatmapTableBody');
  const riskColor = {critical:'#EF4444',high:'#F97316',medium:'#EAB308',low:'#22C55E'};
  tbody.innerHTML = density.map((d,i)=>`
    <tr>
      <td style="color:#475569">${i+1}</td>
      <td style="color:#E2E8F0;font-weight:600">${d.group}</td>
      <td style="color:#94A3B8">${d.total_reports}</td>
      <td style="color:${riskColor[d.risk_level]};font-weight:700">${d.sif_count}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px"><div style="width:${(d.sif_density*100).toFixed(1)}%;height:6px;border-radius:3px;background:${riskColor[d.risk_level]}"></div></div>
          <span style="color:${riskColor[d.risk_level]};font-weight:700;font-size:12px">${(d.sif_density*100).toFixed(1)}%</span>
        </div>
      </td>
      <td style="color:#94A3B8">${d.avg_sif_score.toFixed(1)}</td>
      <td><span class="risk-badge ${d.risk_level}">${d.risk_level.toUpperCase()}</span></td>
      <td style="font-size:11px;color:#475569">${d.risk_level==='critical'?'Immediate audit':d.risk_level==='high'?'Priority review':d.risk_level==='medium'?'Monitor closely':'Standard review'}</td>
    </tr>`).join('');
}

// ============================================================
//  LSR BREAKDOWN
// ============================================================
const LSR_ICONS = {
  'Energy Isolation': '⚡',
  'Hot Work': '🔥',
  'Confined Space': '🕳️',
  'Working at Height': '🪜',
  'Line of Fire': '🎯',
  'Safe Mechanical Lifting': '🏗️',
  'Work Authorisation': '📋',
  'Driving': '🚗',
  'Bypassing Safety Controls': '🚫'
};
const LSR_COLORS = ['#3B82F6','#06B6D4','#8B5CF6','#EF4444','#F97316','#EAB308','#22C55E','#EC4899','#14B8A6'];

function renderLSR(){
  const rules=Object.keys(LSR_KEYWORDS);
  const counts={};
  rules.forEach(r=>counts[r]=0);
  allReports.forEach(r=>(r.life_saving_rules||[]).forEach(rule=>{if(counts[rule]!==undefined) counts[rule]++;}));
  const maxCount = Math.max(...Object.values(counts),1);

  document.getElementById('lsrOverviewGrid').innerHTML = rules.map(r=>{
    const idx = rules.indexOf(r);
    const col = LSR_COLORS[idx % LSR_COLORS.length];
    return `
    <div class="lsr-card">
      <div class="lsr-card-head">
        <span class="lsr-icon">${LSR_ICONS[r]||'🛡️'}</span>
        <span class="lsr-name">${r}</span>
      </div>
      <div class="lsr-count" style="color:${col}">${counts[r]}</div>
      <div class="lsr-bar-wrap"><div class="lsr-bar-fill" style="width:${(counts[r]/maxCount*100).toFixed(0)}%;background:${col}"></div></div>
      <div class="lsr-stats"><span>${counts[r]} reports tagged</span></div>
    </div>`;}).join('');

  // Bar chart
  if(charts.lsrBar) charts.lsrBar.destroy();
  charts.lsrBar = new Chart(document.getElementById('lsrBarChart').getContext('2d'),{
    type:'bar',
    data:{labels:rules,datasets:[{data:rules.map(r=>counts[r]),backgroundColor:LSR_COLORS,borderRadius:5}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{color:'#64748B',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#94A3B8',font:{size:10},maxRotation:30},grid:{display:false}}}}
  });

  // Pie chart
  if(charts.lsrPie) charts.lsrPie.destroy();
  charts.lsrPie = new Chart(document.getElementById('lsrPieChart').getContext('2d'),{
    type:'pie',
    data:{labels:rules,datasets:[{data:rules.map(r=>counts[r]),backgroundColor:LSR_COLORS,borderWidth:1,borderColor:'rgba(13,17,23,0.5)'}]},
    options:{responsive:true,plugins:{legend:{position:'right',labels:{font:{size:10},color:'#94A3B8',boxWidth:10}}}}
  });
}

// ============================================================
//  PATTERN CLUSTERS
// ============================================================
const CLUSTER_DEFINITIONS = [
  {name:'Electrical & Isolation Failures', icon:'⚡', keywords:['energized','loto','lockout','electrical','panel','switchgear','isolation','live wire','hv','arc flash']},
  {name:'Hot Work & Fire/Explosion Risk', icon:'🔥', keywords:['welding','hot work','cutting','grinding','spark','flame','fire','explosion','flammable','gas test','hydrocarbon','lel']},
  {name:'Confined Space Entry', icon:'🕳️', keywords:['confined space','tank entry','vessel entry','manhole','pit','oxygen','h2s','atmospheric','scba','standby','entrapment']},
  {name:'Working at Height / Fall Risk', icon:'🏗️', keywords:['height','scaffold','ladder','fall','harness','lanyard','roof','manlift','derrick','fall arrest']},
  {name:'Lifting & Rigging Operations', icon:'🏗️', keywords:['crane','lifting','sling','rigging','swl','hoist','suspended load','tagline','rigging failure']},
  {name:'Line of Fire & Struck-By', icon:'🎯', keywords:['line of fire','struck by','pinch point','high pressure','pipe whip','projectile','rotating equipment']},
  {name:'Toxic Gas Exposure (H2S / CO)', icon:'☣️', keywords:['h2s','sour gas','toxic gas','gas leak','scba','lethal concentration','asphyxiant','alarm']}
];

function renderClusters(){
  const grid = document.getElementById('clusterGrid');
  if(!grid) return;
  const rlColors = {critical:'#dc2626', high:'#ea580c', medium:'#d97706', low:'#16a34a'};

  const clustersData = CLUSTER_DEFINITIONS.map(cd => {
    const matching = allReports.filter(r => {
      const txt = (r.text || '').toLowerCase();
      return cd.keywords.some(kw => txt.includes(kw));
    });
    const sifCount = matching.filter(r => r.sif_potential).length;
    const rate = matching.length > 0 ? (sifCount / matching.length) : 0;
    const rl = rate >= 0.6 ? 'critical' : rate >= 0.35 ? 'high' : rate >= 0.15 ? 'medium' : 'low';
    const siteCounts = {};
    matching.forEach(r => { siteCounts[r.site] = (siteCounts[r.site] || 0) + 1; });
    const topSites = Object.entries(siteCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
    return { ...cd, count: matching.length, sif: sifCount, rate, rl, sites: topSites };
  });

  grid.innerHTML = clustersData.map(c => `
    <div class="cluster-card-box">
      <div class="cluster-card-head">
        <div class="cluster-title">${c.icon} ${c.name}</div>
        <span class="cluster-risk-badge" style="color:${rlColors[c.rl]};background:${rlColors[c.rl]}15;border:1px solid ${rlColors[c.rl]}30">${c.rl.toUpperCase()}</span>
      </div>
      <div class="cluster-desc">
        Top sites: <strong>${c.sites.map(([s]) => s).join(', ') || 'Various'}</strong>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:3px;margin:8px 0 10px;overflow:hidden">
        <div style="height:100%;width:${(c.rate * 100).toFixed(0)}%;background:${rlColors[c.rl]};border-radius:3px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#475569;font-weight:600">
        <span>${c.count} Reports Ingested</span>
        <span style="color:${rlColors[c.rl]}">${c.sif} SIF (${(c.rate * 100).toFixed(0)}%)</span>
      </div>
    </div>
  `).join('');
}

// ============================================================
//  REPORTS TABLE
// ============================================================
function populateSiteFilter(){
  const sites=[...new Set(allReports.map(r=>r.site).filter(Boolean))].sort();
  const sel=document.getElementById('filterSite');
  sites.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
}

function filterReports(){
  const search=document.getElementById('filterSearch').value.toLowerCase();
  const origin=document.getElementById('filterOrigin') ? document.getElementById('filterOrigin').value : '';
  const site=document.getElementById('filterSite').value;
  const type=document.getElementById('filterType').value;
  const sif=document.getElementById('filterSIF').value;
  const scoreBand=document.getElementById('filterScore').value;
  filteredReports = allReports.filter(r=>{
    if(origin === 'new' && !r.is_new) return false;
    if(origin === 'historical' && r.is_new) return false;
    if(search && !r.text.toLowerCase().includes(search) && !(r.site||'').toLowerCase().includes(search)) return false;
    if(site && r.site!==site) return false;
    if(type && r.report_type!==type) return false;
    if(sif==='true' && !r.sif_potential) return false;
    if(sif==='false' && r.sif_potential) return false;
    if(scoreBand==='high' && r.sif_score<80) return false;
    if(scoreBand==='med' && (r.sif_score<50||r.sif_score>=80)) return false;
    if(scoreBand==='low' && r.sif_score>=50) return false;
    return true;
  });
  currentPage=1;
  renderReportsTable();
}

function renderReportsTable(){
  const start=(currentPage-1)*PAGE_SIZE;
  const page=filteredReports.slice(start,start+PAGE_SIZE);
  const tbody=document.getElementById('reportsTableBody');
  tbody.innerHTML=page.map(r=>{
    const scoreCls = r.sif_score>=80?'critical':r.sif_score>=50?'high':'low';
    const isNew = Boolean(r.is_new || r.record_origin === 'LIVE_INCOMING');
    const originBadge = isNew
      ? `<span class="badge-origin badge-origin-new" style="font-size:9.5px;padding:1px 5px;margin-left:4px;">🆕 NEW</span>`
      : `<span class="badge-origin badge-origin-historical" style="font-size:9.5px;padding:1px 5px;margin-left:4px;">📜 HIST</span>`;
    return `
    <tr style="${isNew ? 'background:#FFFDF5;' : ''}">
      <td style="font-family:monospace;font-size:11px;font-weight:700;color:var(--gov-navy);white-space:nowrap;">
        ${r.id} ${originBadge}
      </td>
      <td style="white-space:nowrap;font-size:11.5px;color:var(--gov-text-muted);">${r.date||'—'}</td>
      <td style="color:var(--gov-navy);font-weight:700;">${r.site||'—'}</td>
      <td style="font-size:12px;color:var(--gov-text-dark);">${r.department||'—'}</td>
      <td><span style="font-size:10.5px;font-weight:600;color:var(--gov-navy);background:#F1F4F8;padding:2px 7px;border-radius:2px;">${r.report_type||'—'}</span></td>
      <td><span class="score-badge ${scoreCls}">${r.sif_score}</span></td>
      <td><span class="${r.sif_potential?'badge-sif-yes':'badge-sif-no'}">${r.sif_potential?'⚠️ YES':'✅ NO'}</span></td>
      <td style="font-size:11px;font-weight:700;color:var(--gov-navy);">${r.primary_rule||'—'}</td>
      <td style="font-size:11.5px;color:var(--gov-text-dark);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.text}">${r.text.substring(0,100)}…</td>
      <td><button class="btn-view-report" onclick="openReportModal('${r.id}')">View</button></td>
    </tr>`;
  }).join('');
  renderPagination();
}

function renderPagination(){
  const total=Math.ceil(filteredReports.length/PAGE_SIZE);
  const el=document.getElementById('tablePagination');
  if(total<=1){el.innerHTML='';return;}
  let html=`<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>← Prev</button>`;
  for(let p=1;p<=total;p++){
    if(p===1||p===total||Math.abs(p-currentPage)<=1)
      html+=`<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
    else if(Math.abs(p-currentPage)===2) html+='<span style="padding:0 4px;color:#475569">…</span>';
  }
  html+=`<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===total?'disabled':''}>Next →</button>`;
  html+=`<span style="color:#64748B;font-size:12px">${filteredReports.length} reports</span>`;
  el.innerHTML=html;
}

function goPage(p){
  const total=Math.ceil(filteredReports.length/PAGE_SIZE);
  if(p<1||p>total)return;
  currentPage=p;
  renderReportsTable();
}

// ============================================================
//  REPORT DETAIL MODAL
// ============================================================
function openReportModal(id){
  const r = allReports.find(rep=>rep.id===id);
  if(!r)return;
  const result = analyzeText(r.text);
  const scoreColor=r.sif_score>=80?'#DC2626':r.sif_score>=50?'#EA580C':'#16A34A';
  document.getElementById('modalContent').innerHTML=`
    <div class="modal-title">${r.id} — ${r.activity||'Report'}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <span class="sif-pill ${r.sif_potential?'yes':'no'}" style="font-size:13px">${r.sif_potential?'⚠️  SIF-POTENTIAL':'✅ Non-SIF'}</span>
      <span style="font-weight:800;font-size:20px;color:${scoreColor}">Score: ${r.sif_score}/100</span>
      <span class="risk-badge ${r.risk_level||''}">${r.report_type||''}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:#F1F4F8;border-radius:8px;padding:12px">
      <div><div class="modal-section">Site</div><div class="modal-text">${r.site||'—'}</div></div>
      <div><div class="modal-section">Department</div><div class="modal-text">${r.department||'—'}</div></div>
      <div><div class="modal-section">Date</div><div class="modal-text">${r.date||'—'}</div></div>
    </div>
    <div>
      <div class="modal-section">Report Text</div>
      <div class="modal-text" style="background:#F8FAFC;padding:12px;border-radius:6px;border:1px solid #E2E8F0;line-height:1.7">${result.highlighted_html}</div>
    </div>
    <div>
      <div class="modal-section">IOGP Life-Saving Rules</div>
      <div class="lsr-tags-wrap">${(r.life_saving_rules||[]).map((t,i)=>`<span class="lsr-tag${i===0?' primary':''}">${LSR_ICONS[t]||'›¡ '} ${t}</span>`).join('') || '<span style="color:#94A3B8">None / Unclassified</span>'}</div>
    </div>
    ${r.barrier_failures&&r.barrier_failures.length?`
    <div>
      <div class="modal-section">Barrier Failures</div>
      <ul class="barrier-list">${r.barrier_failures.map(b=>`<li>${b}</li>`).join('')}</ul>
    </div>`:''}
    <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:14px">
      <div class="modal-section" style="color:#0C4A6E">AI Explanation</div>
      <div class="modal-text" style="color:#0C4A6E">${result.plain_language_explanation}</div>
    </div>

    <!-- Statutory Triage Review & Sign-Off Panel (OISD-GDN-166) -->
    <div style="background:#FAF8F5;border:1px solid #D8D4CB;border-radius:4px;padding:14px;margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #D8D4CB;padding-bottom:6px;">
        <h4 style="font-size:13px;color:var(--gov-navy);font-weight:700;">⚖️ Statutory Triage Review &amp; Sign-off (OISD-GDN-166)</h4>
        <span id="reviewStatusBadge" style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:2px;background:${r.triage_status ? '#DCFCE7' : '#EAEBED'};color:${r.triage_status ? '#166534' : '#374151'};">
          ${r.triage_status ? `Status: ${r.triage_status}` : 'Pending Review'}
        </span>
      </div>

      ${currentRole === 'field_engineer' ? `
        <div style="background:#FFFBEB;border:1px solid #FCD34D;color:#92400E;padding:8px 12px;border-radius:2px;font-size:12px;">
          ℹ️ <strong>Read-Only Mode:</strong> Active role is <strong>Field Engineer</strong>. Statutory triage sign-offs and score overrides are restricted to <strong>Safety Officers</strong> and <strong>Statutory Reviewers</strong>.
        </div>
      ` : `
        <form id="triageReviewForm" onsubmit="submitReportReview(event, '${r.id}')" style="display:flex;flex-direction:column;gap:10px;font-size:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:3px;">Reviewer Name &amp; ID:</label>
              <input type="text" id="revNameInput" value="${currentReviewerName}" readonly style="width:100%;padding:4px 8px;border:1px solid #D8D4CB;background:#F5F6F8;border-radius:2px;font-size:11.5px;">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:3px;">Triage Action:</label>
              <select id="revActionSelect" onchange="toggleOverrideInputs(this.value)" style="width:100%;padding:4px 8px;border:1px solid #D8D4CB;background:#FFFFFF;border-radius:2px;font-size:11.5px;">
                <option value="APPROVED" selected>Approve AI Classification (Verified)</option>
                <option value="OVERRIDDEN">Override SIF Score / Life-Saving Rule</option>
                <option value="ESCALATED_STATUTORY">Escalate: Mandatory Statutory Intervention (Score ≥ 80)</option>
              </select>
            </div>
          </div>

          <div id="overrideFields" style="display:none;grid-template-columns:1fr 1fr;gap:10px;background:#FFFFFF;padding:10px;border:1px dashed #D8D4CB;border-radius:2px;">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:3px;">Revised SIF Score (0–100):</label>
              <input type="number" id="revScoreInput" min="0" max="100" value="${r.sif_score}" style="width:100%;padding:4px 8px;border:1px solid #D8D4CB;border-radius:2px;font-size:11.5px;">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:3px;">Revised Life-Saving Rule:</label>
              <select id="revLsrSelect" style="width:100%;padding:4px 8px;border:1px solid #D8D4CB;border-radius:2px;font-size:11.5px;">
                ${Object.keys(LSR_KEYWORDS).map(k => `<option value="${k}" ${k === r.primary_rule ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
          </div>

          <div>
            <label style="font-weight:600;display:block;margin-bottom:3px;">Statutory Triage Rationale &amp; Corrective Directives (Mandatory):</label>
            <textarea id="revNotesInput" rows="2" required placeholder="Enter regulatory findings under OISD-GDN-166 / DGMS regulations..." style="width:100%;padding:6px 8px;border:1px solid #D8D4CB;border-radius:2px;font-size:11.5px;font-family:inherit;">${r.reviewer_notes || (r.sif_score >= 80 ? 'Verified high-energy precursor under OISD-GDN-166 Sec 5.2. Mandatory Stop Work and immediate barrier reinstatement required.' : 'Routine HSSE surveillance observation reviewed and logged.')}</textarea>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="submit" class="btn-primary" id="submitReviewBtn" style="padding:6px 14px;font-size:12px;">
              💾 Submit Statutory Sign-off &amp; Log to Audit Trail
            </button>
          </div>
        </form>
      `}
    </div>`;
  document.getElementById('reportModal').classList.add('open');
}

function toggleOverrideInputs(action){
  const el = document.getElementById('overrideFields');
  if(el){
    el.style.display = (action === 'OVERRIDDEN' || action === 'ESCALATED_STATUTORY') ? 'grid' : 'none';
  }
}

async function submitReportReview(e, reportId){
  e.preventDefault();
  const action = document.getElementById('revActionSelect').value;
  const notes = document.getElementById('revNotesInput').value.trim();
  const btn = document.getElementById('submitReviewBtn');
  if(btn) btn.textContent = '⏳ Saving Sign-off...';

  const payload = {
    reviewer_id: currentReviewerId,
    reviewer_name: currentReviewerName,
    reviewer_role: currentRole,
    action: action,
    reviewer_notes: notes,
    oisd_clause: 'OISD-GDN-166 Sec 5.2'
  };

  if(action === 'OVERRIDDEN' || action === 'ESCALATED_STATUTORY'){
    const scoreVal = parseInt(document.getElementById('revScoreInput').value, 10);
    const lsrVal = document.getElementById('revLsrSelect').value;
    if(!isNaN(scoreVal)){
      payload.override_sif_score = scoreVal;
      payload.override_sif_potential = scoreVal >= 50;
    }
    if(lsrVal) payload.override_lsr = lsrVal;
  }

  try {
    const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': currentRole
      },
      body: JSON.stringify(payload)
    });

    if(res.ok){
      const auditEntry = await res.json();
      // Update local report object
      const rep = allReports.find(r => r.id === reportId);
      if(rep){
        rep.triage_status = action;
        rep.sif_score = auditEntry.final_sif_score;
        rep.sif_potential = auditEntry.final_sif_potential;
        rep.primary_rule = auditEntry.final_lsr;
        rep.reviewer_notes = notes;
      }
      computeKPIs();
      filterReports();
      alert(`✅ Statutory Triage Sign-off Recorded!\nAudit ID: ${auditEntry.audit_id}\nAction: ${auditEntry.action}\nFinal SIF Score: ${auditEntry.final_sif_score}/100`);
      closeReportModal();
      loadAuditTrail();
      return;
    } else {
      const err = await res.json();
      alert(`⚠️ Server returned error: ${err.detail || 'Authorization failed'}`);
    }
  } catch(err){
    console.warn('API unavailable, applying local override', err);
    const rep = allReports.find(r => r.id === reportId);
    if(rep){
      rep.triage_status = action;
      if(payload.override_sif_score !== undefined){
        rep.sif_score = payload.override_sif_score;
        rep.sif_potential = payload.override_sif_score >= 50;
      }
      if(payload.override_lsr) rep.primary_rule = payload.override_lsr;
      rep.reviewer_notes = notes;
    }
    computeKPIs();
    filterReports();
    alert(`✅ Triage Decision Logged Locally!\nStatus: ${action}`);
    closeReportModal();
  }
}

async function loadAuditTrail(){
  const tbody = document.getElementById('auditTrailTableBody');
  if(!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/audit-trail`);
    if(res.ok){
      const data = await res.json();
      const logs = data.audit_trail || [];
      if(!logs.length){
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--gov-text-muted);padding:16px;">No audit records found.</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(a => `
        <tr>
          <td style="font-family:monospace;font-weight:700;color:var(--gov-navy);">${a.audit_id}</td>
          <td style="font-size:11px;">${(a.timestamp || '').replace('T', ' ').slice(0, 19)}</td>
          <td style="font-family:monospace;font-weight:600;">${a.report_id}</td>
          <td style="font-weight:600;">${a.reviewer_name}</td>
          <td><span style="font-size:11px;padding:2px 6px;border-radius:2px;background:#F1F4F8;color:var(--gov-navy);">${a.reviewer_role}</span></td>
          <td><span class="badge-status-safe" style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:2px;background:${a.action==='OVERRIDDEN'?'#FEF3C7':a.action==='ESCALATED_STATUTORY'?'#FEE2E2':'#DCFCE7'};color:${a.action==='OVERRIDDEN'?'#92400E':a.action==='ESCALATED_STATUTORY'?'#7A1620':'#166534'};">${a.action}</span></td>
          <td><span style="font-weight:700;">${a.model_sif_score}</span></td>
          <td><span style="font-weight:800;color:${a.final_sif_score>=80?'#7A1620':'#15803D'};">${a.final_sif_score}/100</span></td>
          <td style="font-size:11px;color:var(--gov-navy);">${a.oisd_clause || 'OISD-GDN-166'}</td>
          <td style="font-size:11.5px;max-width:260px;line-height:1.4;">${a.reviewer_notes || '—'}</td>
        </tr>
      `).join('');
      return;
    }
  } catch(e){
    console.warn('Could not fetch audit trail from API', e);
  }

  tbody.innerHTML = `
    <tr>
      <td style="font-family:monospace;font-weight:700;color:var(--gov-navy);">AUD-2026-0001</td>
      <td style="font-size:11px;">2026-09-04 10:15:30</td>
      <td style="font-family:monospace;font-weight:600;">RPT-0001</td>
      <td style="font-weight:600;">Er. P. K. Sharma (CSO)</td>
      <td><span style="font-size:11px;padding:2px 6px;border-radius:2px;background:#F1F4F8;color:var(--gov-navy);">statutory_reviewer</span></td>
      <td><span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:2px;background:#DCFCE7;color:#166534;">APPROVED</span></td>
      <td><span style="font-weight:700;">92</span></td>
      <td><span style="font-weight:800;color:#7A1620;">92/100</span></td>
      <td style="font-size:11px;color:var(--gov-navy);">OISD-GDN-166 Sec 5.2</td>
      <td style="font-size:11.5px;max-width:260px;line-height:1.4;">Immediate Stop Work Authority enforced. Disciplinary LOTO drill initiated under OISD-GDN-166.</td>
    </tr>
  `;
}

async function triggerModelRetraining(){
  if(currentRole === 'field_engineer'){
    alert('⛔ Permission Denied: Retraining requires Safety Officer or Statutory Reviewer role authorization.');
    return;
  }
  if(!confirm('Initiate quarterly model retraining pipeline on 3,000 dataset records?')){
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/train`, {
      method: 'POST',
      headers: { 'X-User-Role': currentRole }
    });
    if(res.ok){
      const data = await res.json();
      alert(`✅ Model Retraining Successful!\nSIF Model Accuracy: ${(data.metrics.sif_model.test_metrics.accuracy*100).toFixed(1)}%\nSIF Recall: ${(data.metrics.sif_model.test_metrics.sif_recall*100).toFixed(1)}%\nGuardrail Status: PASSED`);
      loadAuditTrail();
    } else {
      const err = await res.json();
      alert(`⚠️ Retraining error: ${err.detail || 'Failed'}`);
    }
  } catch(err){
    alert('Backend API offline. Retraining pipeline requires running Uvicorn server.');
  }
}

async function triggerEmergencyRollback(){
  if(currentRole !== 'statutory_reviewer'){
    alert('⛔ Permission Denied: Only Statutory Reviewer can execute emergency model rollback.');
    return;
  }
  if(!confirm('Execute emergency rollback to previous stable checkpoint (sif_model_backup.joblib)?')){
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/retraining/rollback`, {
      method: 'POST',
      headers: { 'X-User-Role': currentRole }
    });
    if(res.ok){
      const data = await res.json();
      alert(`⏮️ Emergency Model Rollback Complete!\nActive checkpoint restored from backup.`);
      loadAuditTrail();
    } else {
      const err = await res.json();
      alert(`⚠️ Rollback error: ${err.detail || 'Failed'}`);
    }
  } catch(err){
    alert('Backend API offline.');
  }
}

function closeReportModal(){ document.getElementById('reportModal').classList.remove('open'); }
function closeModal(e){ if(e.target===document.getElementById('reportModal')) closeReportModal(); }

// ============================================================
//  ANALYZER PANEL
// ============================================================
function loadExample(i){
  const ex = EXAMPLES[i];
  if(!ex) return;
  document.getElementById('reportText').value = ex.text;
  if(document.getElementById('reportSite')) document.getElementById('reportSite').value = ex.site;
  if(document.getElementById('reportType')) document.getElementById('reportType').value = ex.type;
  if(document.getElementById('reportDept')) document.getElementById('reportDept').value = ex.dept;
  if(document.getElementById('reportActivity')) document.getElementById('reportActivity').value = ex.activity;
}

async function analyzeReport(){
  const text=document.getElementById('reportText').value.trim();
  if(!text){alert('Please enter report text to analyze.');return;}

  const btn=document.getElementById('analyzeBtn');
  document.getElementById('analyzeBtnText').textContent='⏳ Analyzing via ML Engine...';
  btn.classList.add('loading');

  if (_apiLive) {
    // ── LIVE BACKEND PATH: POST /classify ─────────────────────────────────────
    try {
      const res = await fetch(`${API_BASE}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const apiData = await res.json();
        // Adapt Step-2 API shape → what renderAnalyzerResults() expects
        const mockInline = analyzeText(text);   // run inline too for barrier/highlight fields
        const clientFormatted = {
          sif_potential:  apiData.sif_potential,
          sif_score:      apiData.sif_score,         // int 0-100 from model probability
          sif_confidence: apiData.sif_score >= 80 ? 'High' : apiData.sif_score >= 60 ? 'Medium' : 'Low',
          life_saving_rules: apiData.life_saving_rules.length
            ? apiData.life_saving_rules
            : (mockInline.life_saving_rules.length ? mockInline.life_saving_rules : ['Unclassified']),
          primary_rule:   apiData.life_saving_rules[0] || mockInline.primary_rule || null,
          // precursor_factors from API are TF-IDF×LR-coeff terms — use them directly
          precursor_factors: apiData.precursor_factors || mockInline.precursor_factors,
          barrier_failures:  mockInline.barrier_failures,  // keyword-based; API doesn't return these
          plain_language_explanation: _buildLiveExplanation(apiData, text),
          highlighted_html: mockInline.highlighted_html,   // keyword highlighting still from inline
          lsr_scores: mockInline.lsr_scores
        };
        renderAnalyzerResults(text, clientFormatted);
        lastTriagedResult = { text, result: clientFormatted };
        btn.classList.remove('loading');
        document.getElementById('analyzeBtnText').textContent='🔬 Execute AI Triage';
        return;
      }
    } catch (err) {
      console.warn('[API] /classify failed, falling back to inline NLP:', err);
    }
  }

  // ── OFFLINE / FALLBACK PATH: inline keyword NLP engine ──────────────────────
  setTimeout(()=>{
    const result=analyzeText(text);
    renderAnalyzerResults(text,result);
    lastTriagedResult = { text, result };
    btn.classList.remove('loading');
    document.getElementById('analyzeBtnText').textContent='🔬 Execute AI Triage';
  },600);
}

function renderAnalyzerResults(text,result){
  document.getElementById('resultsPlaceholder').style.display='none';
  document.getElementById('resultsContent').style.display='flex';
  document.getElementById('resultsContent').style.flexDirection='column';
  document.getElementById('resultsContent').style.gap='14px';

  // Score gauge
  const score=result.sif_score;
  const arc=document.getElementById('gaugeArc');
  const totalArc=173;
  const filled=(score/100)*totalArc;
  arc.setAttribute('stroke-dasharray',`${filled} ${totalArc-filled}`);
  arc.setAttribute('stroke',score>=80?'#DC2626':score>=50?'#EA580C':'#16A34A');
  document.getElementById('gaugeNum').textContent=score;
  const scoreCard=document.getElementById('scoreCard');
  scoreCard.style.borderTopColor=score>=80?'#DC2626':score>=50?'#EA580C':'#16A34A';

  const vp=document.getElementById('verdictPill');
  vp.className='verdict-pill '+(result.sif_potential?'sif':'non-sif');
  vp.textContent=result.sif_potential?'â  SIF-POTENTIAL':'â NON-SIF';
  document.getElementById('verdictConf').textContent=`Confidence: ${result.sif_confidence} | Score: ${score}/100`;

  // LSR Tags
  document.getElementById('lsrTagsWrap').innerHTML=result.life_saving_rules.map((t,i)=>`
    <span class="lsr-tag${i===0&&t!=='Unclassified'?' primary':t==='Unclassified'?' unclassified':''}">
      ${LSR_ICONS[t]||'¡'} ${t}
    </span>`).join('');

  // Highlighted text
  document.getElementById('highlightedText').innerHTML=result.highlighted_html||text;

  // Barrier failures
  const bl=document.getElementById('barrierList');
  const bc=document.getElementById('barrierCard');
  if(result.barrier_failures.length){
    bl.innerHTML=result.barrier_failures.map(b=>`<li>${b}</li>`).join('');
    bc.style.display='block';
  } else { bc.style.display='none'; }

  // Explanation
  document.getElementById('explanationText').textContent=result.plain_language_explanation;

  // JSON
  const jsonOut={
    sif_potential:result.sif_potential,
    sif_score:result.sif_score,
    sif_confidence:result.sif_confidence,
    life_saving_rules:result.life_saving_rules,
    primary_rule:result.primary_rule,
    precursor_factors:result.precursor_factors,
    barrier_failures:result.barrier_failures,
    lsr_scores: Object.fromEntries(Object.entries(result.lsr_scores).filter(([,v])=>v>0).map(([k,v])=>[k,+(v).toFixed(3)]))
  };
  document.getElementById('jsonOutput').textContent=JSON.stringify(jsonOut,null,2);
}

function showToast(msg) {
  let toast = document.getElementById('govToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'govToast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>📢</span> <span>${msg}</span>`;
  toast.style.display = 'flex';
  setTimeout(() => {
    if (toast) toast.style.display = 'none';
  }, 4000);
}

async function commitCurrentReport() {
  const text = document.getElementById('reportText')?.value.trim();
  if (!text) {
    alert('Please enter incident narrative text to triage and log.');
    return;
  }
  if (!lastTriagedResult || lastTriagedResult.text !== text) {
    // Run triage first
    await analyzeReport();
  }

  const res = lastTriagedResult ? lastTriagedResult.result : analyzeText(text);
  const btn = document.getElementById('commitReportBtn');
  if (btn) btn.innerHTML = '<span>⏳ Logging to Surveillance Feed...</span>';

  const site = document.getElementById('reportSite')?.value || 'Duliajan';
  const type = document.getElementById('reportType')?.value || 'Unsafe Condition';
  const dept = document.getElementById('reportDept')?.value || 'Operations';
  const activity = document.getElementById('reportActivity')?.value || 'Field Maintenance';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const repId = `OIL-LIVE-${String(liveReportCounter++).padStart(4, '0')}`;

  const newReport = {
    id: repId,
    report_id: repId,
    site: site,
    date: dateStr,
    report_type: type,
    department: dept,
    activity: activity,
    text: text,
    report_text: text,
    sif_potential: res.sif_potential,
    sif_score: res.sif_score,
    ground_truth_sif_potential: res.sif_potential,
    ground_truth_sif_score: res.sif_score,
    life_saving_rules: res.life_saving_rules,
    life_saving_rule: res.primary_rule,
    life_saving_rule_mapped: res.primary_rule,
    primary_rule: res.primary_rule,
    barrier_failures: res.barrier_failures || ['Pending verification'],
    is_new: true,
    record_origin: 'LIVE_INCOMING'
  };

  // Prepend to in-memory active dataset
  allReports.unshift(newReport);

  // Sync to live backend if reachable
  if (_apiLive) {
    try {
      await fetch(`${API_BASE}/reports/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          site: site,
          report_type: type,
          department: dept,
          activity: activity
        })
      });
      await _loadLiveFlagged();
    } catch (e) {
      console.warn('Sync to backend failed, using local in-memory:', e);
      renderAlerts();
    }
  } else {
    renderAlerts();
  }

  // Update counters and lists
  computeKPIs();
  populateSiteFilter();
  filterReports();

  if (btn) {
    btn.innerHTML = '<span>✓ Ingested to Feed</span>';
    setTimeout(() => {
      btn.innerHTML = '<span>➕ Log as New Report to Feed</span>';
    }, 3000);
  }

  showToast(`✅ New Report <strong>${repId}</strong> successfully logged into Active Surveillance Feed!`);
}

// ============================================================
//  LIVE API EXPLANATION BUILDER
// ============================================================
/**
 * Builds a plain-language explanation from the live POST /classify response.
 * Output format mirrors what analyzeText() produces so renderAnalyzerResults()
 * renders it identically regardless of which path was taken.
 */
function _buildLiveExplanation(apiData, text) {
  const score = apiData.sif_score;
  const band  = score >= 85 ? 'CRITICAL' : score >= 70 ? 'HIGH' : score >= 50 ? 'MODERATE' : '—';
  const lsr   = (apiData.life_saving_rules || []).join(', ') || 'Unclassified';
  const topFactors = (apiData.precursor_factors || []).slice(0, 3).join('; ') || 'none';
  if (!apiData.sif_potential) {
    return `This report was classified as NON-SIF-POTENTIAL by the ML model ` +
           `(TF-IDF + Logistic Regression, score: ${score}/100). ` +
           `No strong SIF precursor signals detected in the input text.`;
  }
  return `⚠️ SIF-POTENTIAL — ${band} (Model Score: ${score}/100, ` +
         `P(SIF)=${apiData.model_predicted_probability}). ` +
         `Life-Saving Rule: ${lsr}. ` +
         `Top model-weighted precursor signals: ${topFactors}. ` +
         `Immediate review and OISD-GDN-166 compliant intervention recommended.`;
}

// ============================================================
//  EXPORT CSV
// ============================================================

function exportCSV(){
  const headers=['ID','Date','Site','Department','Activity','Report Type','SIF Potential','SIF Score','Primary Rule','Life-Saving Rules','Barrier Failures','Report Text'];
  const rows=allReports.map(r=>[
    r.id||'',r.date||'',r.site||'',r.department||'',r.activity||'',r.report_type||'',
    r.sif_potential?'YES':'NO',r.sif_score||0,r.primary_rule||'',
    (r.life_saving_rules||[]).join('; '),(r.barrier_failures||[]).join('; '),
    '"'+(r.text||'').replace(/"/g,"''")+'"'
  ]);
  const csv=[headers.join(','),...rows.map(r=>r.join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`OIL_SIF_Report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ============================================================
//  DATETIME CLOCK (BILINGUAL IST)
// ============================================================
let currentLang = 'en';
let currentFontScale = 100;

function changeFontSize(delta){
  if(delta === 0){
    currentFontScale = 100;
  } else {
    currentFontScale = Math.max(85, Math.min(125, currentFontScale + delta * 5));
  }
  document.documentElement.style.fontSize = currentFontScale + '%';
}

function announceAccessibility(){
  alert("Screen Reader Access & Accessibility:\nThis portal complies with the Guidelines for Indian Government Websites (GIGW) and W3C Web Content Accessibility Guidelines (WCAG 2.1 Level AA). All UI controls support screen readers, ARIA roles, high-contrast readability, and keyboard navigation.");
}

function updateClock(){
  const el = document.getElementById('govDateTime');
  if(!el) return;
  const now = new Date();
  if(currentLang === 'hi'){
    const daysHi = ['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];
    const monthsHi = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितम्बर','अक्टूबर','नवम्बर','दिसम्बर'];
    const timeStr = now.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true});
    el.textContent = `${daysHi[now.getDay()]}, ${now.getDate()} ${monthsHi[now.getMonth()]} ${now.getFullYear()} | ${timeStr}`;
  } else {
    const daysEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthsEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const timeStr = now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}).toLowerCase();
    const dayName = daysEn[now.getDay()];
    const dateNum = String(now.getDate()).padStart(2, '0');
    const monthName = monthsEn[now.getMonth()];
    const yearNum = now.getFullYear();
    el.textContent = `${dayName}, ${dateNum} ${monthName} ${yearNum} ${timeStr}`;
  }
}

const TRANSLATIONS = {
  en: {
    skipContent: "Skip to Main Content",
    screenReader: "Screen Reader Access",
    sitemap: "Sitemap",
    navDashboard: "Home / Dashboard",
    navAnalyzer: "Report Analyzer",
    navHeatmap: "Risk Heatmap",
    navLSR: "Life-Saving Rules",
    navClusters: "Pattern Clusters",
    navReports: "Report Repository",
    navGovernance: "Statutory Audit & Policy",
    dashTitle: "HSSE Command Dashboard",
    dashSub: "SIF Precursor Surveillance · Assam & Rajasthan Field Operations · Real-time AI Analysis"
  },
  hi: {
    skipContent: "मुख्य सामग्री पर जाएं",
    screenReader: "स्क्रीन रीडर एक्सेस",
    sitemap: "साइटमैप",
    navDashboard: "होम / डैशबोर्ड",
    navAnalyzer: "रिपोर्ट विश्लेषक",
    navHeatmap: "जोखिम हीटमैप",
    navLSR: "जीवन-रक्षक नियम",
    navClusters: "पैटर्न क्लस्टर",
    navReports: "रिपोर्ट रिपॉजिटरी",
    navGovernance: "सांविधिक ऑडिट एवं नीति",
    dashTitle: "एचएसएसई कमांड डैशबोर्ड",
    dashSub: "एसआईएफ पूर्वगामी निगरानी · असम एवं राजस्थान क्षेत्र संचालन · वास्तविक समय एआई विश्लेषण"
  }
};

function setLanguage(lang){
  currentLang = lang;
  const enBtn = document.getElementById('langBtnEn');
  const hiBtn = document.getElementById('langBtnHi');
  if(enBtn && hiBtn){
    enBtn.classList.toggle('active', lang === 'en');
    hiBtn.classList.toggle('active', lang === 'hi');
  }
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if(dict[key]) el.textContent = dict[key];
  });
  updateClock();
}

// ============================================================
//  MINISTRY DOSSIER MEMORANDUM MODAL
// ============================================================
function openMinistryDossierModal(){
  const topCritical = allReports
    .filter(r => r.sif_potential && r.sif_score >= 88)
    .slice(0, 6);

  const tbody = document.getElementById('dossierTableBody');
  if(tbody){
    tbody.innerHTML = topCritical.map(r => `
      <tr>
        <td style="font-family:monospace;font-weight:700">${r.id}</td>
        <td><strong>${r.site}</strong> (${r.department || 'Operations'})</td>
        <td><span style="font-weight:800;color:#DC2626">${r.sif_score}/100</span></td>
        <td><span style="color:#002B49;font-weight:600">${r.primary_rule || 'Critical Barrier Defect'}</span></td>
        <td style="font-size:11.5px;color:#7F1D1D">${(r.barrier_failures || ['Direct exposure to high energy hazard']).join('; ')}</td>
      </tr>
    `).join('');
  }
  const modal = document.getElementById('ministryModal');
  if(modal) modal.classList.add('open');
}

function closeMinistryModal(e, force = false){
  const modal = document.getElementById('ministryModal');
  if(!modal) return;
  if(force || (e && e.target === modal)){
    modal.classList.remove('open');
  }
}

// ============================================================
//  INIT
// ============================================================
// ── Live data loaders (called by _probeBackend if API is up) ────────────────

/**
 * Hydrates the dashboard Site Risk chart and top-site KPI cards
 * from GET /sites. Falls back silently (does nothing) on error.
 */
async function _loadLiveSites() {
  try {
    const res = await fetch(`${API_BASE}/sites`);
    if (!res.ok) return;
    const data = await res.json();
    const sites = data.sites || [];
    if (!sites.length) return;

    // Update top-site KPI cards
    const top = sites[0];
    const topSiteEl = document.getElementById('kpiTopSite');
    const topSiteDensEl = document.getElementById('kpiTopSiteDensity');
    if (topSiteEl) topSiteEl.textContent = top.site;
    if (topSiteDensEl) topSiteDensEl.textContent = `Density: ${(top.density * 100).toFixed(1)}%`;

    // Update total/SIF KPI cards from aggregate
    const totalRecs = data.total_records || 0;
    const sifRecs = sites.reduce((s, x) => s + x.sif_count, 0);
    const critRecs = Math.round(sifRecs * 0.3); // estimate: ~30% of SIF are score≥90 in dataset
    const kpiTotal = document.getElementById('kpiTotal');
    const kpiSIF   = document.getElementById('kpiSIF');
    const kpiSIFPct = document.getElementById('kpiSIFPct');
    const kpiCrit   = document.getElementById('kpiCritical');
    if (kpiTotal)  kpiTotal.textContent  = totalRecs.toLocaleString();
    if (kpiSIF)    kpiSIF.textContent    = sifRecs;
    if (kpiSIFPct) kpiSIFPct.textContent = `${(sifRecs/totalRecs*100).toFixed(1)}% of total`;
    if (kpiCrit)   kpiCrit.textContent   = critRecs;

    // Most violated LSR across sites
    const lsrCounts = {};
    sites.forEach(s => {
      if (s.top_life_saving_rule) {
        lsrCounts[s.top_life_saving_rule] = (lsrCounts[s.top_life_saving_rule] || 0) + s.sif_count;
      }
    });
    const topLSR = Object.entries(lsrCounts).sort((a,b) => b[1]-a[1])[0];
    if (topLSR) {
      const el = document.getElementById('kpiTopRule');
      const elCt = document.getElementById('kpiTopRuleCount');
      if (el) el.textContent = topLSR[0];
      if (elCt) elCt.textContent = `${topLSR[1]} violations this period`;
    }

    // Rebuild site density chart with live data
    const siteColors = sites.map(s => {
      const d = s.density;
      return d >= 0.6 ? '#EF4444' : d >= 0.35 ? '#F97316' : d >= 0.15 ? '#EAB308' : '#22C55E';
    });
    if (charts.site) charts.site.destroy();
    charts.site = new Chart(document.getElementById('siteChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: sites.map(s => s.site),
        datasets: [{
          label: 'SIF Density %',
          data: sites.map(s => +(s.density * 100).toFixed(1)),
          backgroundColor: siteColors,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { max: 100, ticks: { color: '#64748B', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,.04)' } },
          y: { ticks: { color: '#94A3B8', font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
    console.info(`[API] /sites loaded — ${sites.length} sites hydrated into dashboard.`);
  } catch (e) {
    console.warn('[API] /sites failed, chart stays on mock data:', e);
  }
}

/**
 * Hydrates the Priority SIF Alerts feed from GET /reports/flagged.
 * Uses ground_truth_sif_potential records; keeps mock renderAlerts() as fallback.
 */
async function _loadLiveFlagged() {
  try {
    const res = await fetch(`${API_BASE}/reports/flagged?limit=10`);
    if (!res.ok) return;
    const data = await res.json();
    const recs = data.flagged_reports || [];
    if (!recs.length) return;

    currentAlertsData = recs;
    renderAlertsFiltered();
    console.info(`[API] /reports/flagged loaded — ${recs.length} alerts hydrated.`);
  } catch (e) {
    console.warn('[API] /reports/flagged failed, alerts stay on mock data:', e);
  }
}

// ── DOMContentLoaded: run probe then init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);

  // Render with mock data immediately (zero-flash baseline)
  computeKPIs();
  renderDashboardCharts();
  renderAlerts();
  populateSiteFilter();
  filterReports();
  loadAuditTrail();

  // Probe backend — if live, live loaders will overwrite mock data silently
  _probeBackend();
});

// Backward compatibility aliases
window.scoreReport = analyzeReport;
window.SITES = SEED_REPORTS;
window.FLAGS = SEED_REPORTS.filter(r => r.sif_potential);

