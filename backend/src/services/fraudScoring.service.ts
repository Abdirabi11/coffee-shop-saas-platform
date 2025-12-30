

export const calculateFraudScore = ({
    rapidSessions,
    newFingerprint,
    geoChanged,
  }: {
    rapidSessions: boolean;
    newFingerprint: boolean;
    geoChanged: boolean;
  }) => {
    let score = 0;
  
    if (rapidSessions) score += 40;
    if (newFingerprint) score += 30;
    if (geoChanged) score += 30;
  
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
};
  