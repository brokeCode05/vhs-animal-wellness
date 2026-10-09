// DEMO-ONLY archived fixture. Not loaded by live portals.
(function(){
var DEMO_SEED_DOC = {
    type: 'consultation_summary',
    appointmentId: 'apt900',
    referenceNo: 'VHS-DEMO-APT900',
    userId: '1', // Maria Santos — matches the apt900 demo seed in mock-appointments.js
    petId: '2', // Buddy — matches mock-users.js petId 2 (Maria's Golden Retriever)
    petName: 'Buddy',
    ownerName: 'Maria Santos',
    service: 'Consultation',
    veterinarian: { name: 'Dr. Santos', role: 'Veterinarian' },
    issuedAt: '2026-09-19T10:27:00',
    data: {
      date: '19 Sep 2026', // doctor.js dateDisplay format for 2026-09-19
      time: '10:00',
      startedAt: '2026-09-19T10:02:00',
      completedAt: '2026-09-19T10:27:00',
      durationMinutes: 25,
      weight: '28',
      temperature: '38.6',
      heartRate: '96',
      assessment: 'Healthy adult dog; no abnormalities noted during the visit.',
      plan: 'Continue routine care, balanced diet, and regular exercise. Next check-up as scheduled.'
    }
  };
})();
