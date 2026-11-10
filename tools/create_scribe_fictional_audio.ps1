Add-Type -AssemblyName System.Speech
$destination = Join-Path (Get-Location).Path 'tools/scribe-fictional-audio-test.wav'
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(8000,[System.Speech.AudioFormat.AudioBitsPerSample]::Eight,[System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToWaveFile($destination,$format)
  $synth.Rate = -2
  $parts = [System.Collections.Generic.List[string]]::new()
  $parts.Add('Beginning of fictional consultation test. The owner reports the dog has been coughing for three days.')
  for ($i = 0; $i -lt 15; $i++) { $parts.Add('The owner reports the dog is eating normally and has not been vomiting. On examination the dog is alert. The veterinarian recommends a follow up in one week.') }
  $parts.Add('End of fictional consultation test. The veterinarian recommends a follow up in one week.')
  $synth.Speak(($parts -join ' '))
} finally { $synth.Dispose() }
Write-Output 'Created fictional synthetic speech audio.'
