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

  const raw = [
    ["ABIR", "Bilal", "H26975", "Rachid Ben Daoud"],
    ["ARIF", "Kamel", "F62981", "Mustapha Arbib"],
    ["ASSOUMO", "Alain-Bruno", "D45777", "Sabrina Salemkour"],
    ["BEEHARRY-PANRAY", "Sanjeet", "B09571", "Rachid Ben Daoud"],
    ["BENALLOU", "Radouane", "A02277", "Karim Deboussi"],
    ["BENTOUMI", "Mounir", "E50275", "Karim Deboussi"],
    ["BRIET", "Dylan", "C38084", "Rachid Ben Daoud"],
    ["CAUSSARIEU", "Thomas", "A94073", "Narith Nhiv"],
    ["CISSE", "Amadou", "B99384", "Karim Deboussi"],
    ["CISSE", "Moussa", "I13252", "Laetitia Romao"],
    ["CORREIA", "Christopher", "A37272", "Laetitia Romao"],
    ["DADSI", "Amine", "E23680", "Mustapha Arbib"],
    ["DEBY", "Medhi", "J19576", "Laetitia Romao"],
    ["DESFONTAINES", "Richard", "E51772", "Narith Nhiv"],
    ["DIALLO", "Amadou", "A73777", "Sabrina Salemkour"],
    ["DUBOIS", "Guillaume", "E34879", "Laetitia Romao"],
    ["DUCOLLET", "Jérémy", "J04081", "Zied Zeramdini"],
    ["ESSOBAT NFONZOCK", "Judith", "I20180", "Mustapha Arbib"],
    ["FELHI", "Mohamed", "I16183", "Karim Deboussi"],
    ["FOURMONT", "Cédric", "I20971", "Rachid Ben Daoud"],
    ["GALLEDOU", "Sikhou", "A67070", "Zied Zeramdini"],
    ["GNEBIO", "Noël", "G59180", "Sabrina Salemkour"],
    ["GUFFROY", "Maxime", "G81772", "Sabrina Salemkour"],
    ["HAJJI", "Toufik", "C53276", "Mustapha Arbib"],
    ["HARBOULI", "Rachid", "H49056", "Narith Nhiv"],
    ["HENRY", "Alexandre", "C33576", "Zied Zeramdini"],
    ["HUET", "Frédéric", "E82472", "Zied Zeramdini"],
    ["JOUANNE", "Alexandre", "C20671", "Narith Nhiv"],
    ["KLEIN", "Julien", "J24255", "Laetitia Romao"],
    ["LE BOMIN", "Thomas", "G47781", "Narith Nhiv"],
    ["MAGASSOUBA", "Mohamed", "C30671", "Karim Deboussi"],
    ["MAMMOU", "Mounir", "G90777", "Mustapha Arbib"],
    ["NAVAUX", "Aurélien", "A39083", "Karim Deboussi"],
    ["ROBICHON", "Jordan", "A14356", "Rachid Ben Daoud"],
    ["SALEP", "Alexandre", "G82872", "Karim Deboussi"],
    ["SEGUY", "Alexis", "C35074", "Zied Zeramdini"],
    ["SHEIKH", "Arslan", "F80482", "Laetitia Romao"],
    ["SISSOKO", "Seran", "F86682", "Mustapha Arbib"],
    ["SISSOKO", "Tiémoko", "E06180", "Zied Zeramdini"],
    ["STEHELYN", "Hakim", "E10173", "Rachid Ben Daoud"],
    ["TAKROUNI", "Jamila", "H64778", "Karim Deboussi"],
    ["TCHERNIAWSKY", "Christophe", "C18572", "Laetitia Romao"],
    ["TELDJI", "Djamel", "H11281", "Mustapha Arbib"],
    ["TEMUR", "Berkay Can", "X01563", "Mustapha Arbib"],
    ["THE", "Romain", "E23670", "Zied Zeramdini"],
    ["TOUIL", "Mourad", "D80482", "Sabrina Salemkour"],
    ["VAN-UXEN", "Robert", "J14432", "Narith Nhiv"],
    ["VERTIL", "Wilco", "A77455", "Sabrina Salemkour"],
    ["WELLE", "David", "A31480", "Sabrina Salemkour"]
  ];

  const TECHNICIANS = raw.map((r, i) => {
    const last = String(r[0]).trim().toUpperCase();
    const first = String(r[1]).trim();
    const nni = String(r[2]).trim().toUpperCase();
    const manager = String(r[3]).trim();

    return {
      id: nni,                 // ID = NNI simplifié (stable)
      nni,                     // NNI simplifié
      name: `${last} ${first}`,// Affichage
      lastName: last,
      firstName: first,
      site: SITE,
      manager,
      role: "Technicien Gaz",
      color: PALETTE[i % PALETTE.length]
    };
  });

  window.TECHNICIANS = TECHNICIANS;
})();
