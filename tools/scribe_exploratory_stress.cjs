'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const w={VHS_DOCTOR_SCRIBE_GEMINI:false};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/doctor/doctor-scribe.js'),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout});
const samples={
 tagalog:'Sabi ng may-ari, dalawang araw nang nagsusuka ang aso. Sa pagsusuri, timbang ay 8 kg at temperatura ay 38.5 C. Posibleng gastritis. Planong bumalik sa isang linggo.',
 negation:'Owner reports no vomiting and no diarrhea. On examination no fever was observed. No diagnosis was made. Plan: monitor and return if worse.',
 revised:'Owner reports scratching. On examination weight was 8 kg, corrected to 9 kg on repeat. Temperature 38.5 C. Plan: recheck next week.',
 unit:'Owner reports cough. On examination weight 22 lb and temperature 102.2 F. Heart rate 120 bpm. Plan: revisit next week.',
 hypothetical:'Owner asks whether a temperature of 40 C would be dangerous. No temperature was measured today. Plan: measure temperature during examination.',
 multiple:'Owner reports one dog weighs 8 kg and another dog weighs 12 kg. The patient was not weighed today. Plan: weigh the patient.',
 contradiction:'Subjective: Owner reports vomiting. Objective: Not examined yet. Assessment: None. Plan: Examine later.',
 unclassified:'Patient was seen with owner. Discussed travel paperwork and clinic hours. Follow-up is to be determined.',
 long:'Owner reports itching. '.repeat(360),
};
for (const [name,input] of Object.entries(samples)) {const r=w.DoctorScribe.generateSoapDraft(input); console.log(JSON.stringify({name,ok:r.ok,soap:r.soap,warnings:r.warnings,unclassified:r.unclassified,error:r.error}));}
