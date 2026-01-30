// data/technicians.js
// DEMAT-BT — Référentiel techniciens (VLG uniquement)
// Source: liste fournie par Rachid (Villeneuve-la-Garenne)

(function () {
  const SITE = "Villeneuve-la-Garenne";

  // Palette simple (pour chips/pastilles si besoin)
  const PALETTE = [
    "#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444",
    "#14b8a6", "#f97316", "#84cc16", "#6366f1", "#ec4899",
    "#06b6d4", "#10b981", "#eab308", "#8b5cf6", "#fb7185"
  ];

  // Format: [NOM, Prénom, NNI, Manager, PTC, PTD]
  // PTC = Prise de Travail à Distance
  // PTD = Prise de Travail sur Chantier
  const raw = [
    ["ABIR", "Bilal", "H26975", "Rachid Ben Daoud", true, true],
    ["ARIF", "Kamel", "F62981", "Mustapha Arbib", true, false],
    ["ASSOUMO", "Alain-Bruno", "D45777", "Sabrina Salemkour", true, true],
    ["BEEHARRY-PANRAY", "Sanjeet", "B09571", "Rachid Ben Daoud", false, false],
    ["BENALLOU", "Radouane", "A02277", "Karim Deboussi", true, true],
    ["BENTOUMI", "Mounir", "E50275", "Karim Deboussi", true, true],
    ["BRIET", "Dylan", "C38084", "Rachid Ben Daoud", true, true],
    ["CAUSSARIEU", "Thomas", "A94073", "Narith Nhiv", false, false],
    ["CISSE", "Amadou", "B99384", "Karim Deboussi", true, true],
    ["CISSE", "Moussa", "I13252", "Laetitia Romao", false, false],
    ["CORREIA", "Christopher", "A37272", "Laetitia Romao", false, false],
    ["DADSI", "Amine", "E23680", "Mustapha Arbib", true, true],
    ["DEBY", "Medhi", "J19576", "Laetitia Romao", true, true],
    ["DESFONTAINES", "Richard", "E51772", "Narith Nhiv", false, false],
    ["DIALLO", "Amadou", "A73777", "Sabrina Salemkour", true, true],
    ["DUBOIS", "Guillaume", "E34879", "Laetitia Romao", true, true],
    ["DUCOLLET", "Jérémy", "J04081", "Zied Zeramdini", true, true],
    ["ESSOBAT NFONZOCK", "Judith", "I20180", "Mustapha Arbib", true, true],
    ["FELHI", "Mohamed", "I16183", "Karim Deboussi", true, true],
    ["FOURMONT", "Cédric", "I20971", "Rachid Ben Daoud", false, false],
    ["GALLEDOU", "Sikhou", "A67070", "Zied Zeramdini", false, false],
    ["GNEBIO", "Noël", "G59180", "Sabrina Salemkour", false, false],
    ["GUFFROY", "Maxime", "G81772", "Sabrina Salemkour", true, true],
    ["HAJJI", "Toufik", "C53276", "Mustapha Arbib", false, false],
    ["HARBOULI", "Rachid", "H49056", "Narith Nhiv", false, false],
    ["HENRY", "Alexandre", "C33576", "Zied Zeramdini", false, false],
    ["HUET", "Frédéric", "E82472", "Zied Zeramdini", false, false],
    ["JOUANNE", "Alexandre", "C20671", "Narith Nhiv", true, true],
    ["KLEIN", "Julien", "J24255", "Laetitia Romao", false, false],
    ["LE BOMIN", "Thomas", "G47781", "Narith Nhiv", true, true],
    ["MAGASSOUBA", "Mohamed", "C30671", "Karim Deboussi", false, false],
    ["MAMMOU", "Mounir", "G90777", "Mustapha Arbib", false, false],
    ["NAVAUX", "Aurélien", "A39083", "Karim Deboussi", false, false],
    ["ROBICHON", "Jordan", "A14356", "Rachid Ben Daoud", false, false],
    ["SALEP", "Alexandre", "G82872", "Karim Deboussi", false, false],
    ["SEGUY", "Alexis", "C35074", "Zied Zeramdini", false, false],
    ["SHEIKH", "Arslan", "F80482", "Laetitia Romao", false, false],
    ["SISSOKO", "Seran", "F86682", "Mustapha Arbib", true, true],
    ["SISSOKO", "Tiémoko", "E06180", "Zied Zeramdini", true, true],
    ["STEHELYN", "Hakim", "E10173", "Rachid Ben Daoud", false, false],
    ["TAKROUNI", "Jamila", "H64778", "Karim Deboussi", false, false],
    ["TCHERNIAWSKY", "Christophe", "C18572", "Laetitia Romao", false, false],
    ["TELDJI", "Djamel", "H11281", "Mustapha Arbib", true, true],
    ["TEMUR", "Berkay Can", "X01563", "Mustapha Arbib", true, true],
    ["THE", "Romain", "E23670", "Zied Zeramdini", false, false],
    ["TOUIL", "Mourad", "D80482", "Sabrina Salemkour", true, false],
    ["VAN-UXEN", "Robert", "J14432", "Narith Nhiv", false, false],
    ["VERTIL", "Wilco", "A77455", "Sabrina Salemkour", true, true],
    ["WELLE", "David", "A31480", "Sabrina Salemkour", true, true]
  ];

  const TECHNICIANS = raw.map((r, i) => {
    const last = String(r[0]).trim().toUpperCase();
    const first = String(r[1]).trim();
    const nni = String(r[2]).trim().toUpperCase();
    const manager = String(r[3]).trim();
    const ptc = Boolean(r[4]); // Prise de Travail à Distance
    const ptd = Boolean(r[5]); // Prise de Travail sur Chantier

    return {
      id: nni,                 // ID = NNI simplifié (stable)
      nni,                     // NNI simplifié
      name: `${last} ${first}`,// Affichage
      lastName: last,
      firstName: first,
      site: SITE,
      manager,
      role: "Technicien Gaz",
      color: PALETTE[i % PALETTE.length],
      ptc,                     // Convention PTC
      ptd                      // Convention PTD
    };
  });

  window.TECHNICIANS = TECHNICIANS;
})();
