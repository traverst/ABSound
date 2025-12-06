#!/usr/bin/env ruby
require 'yaml'
require 'json'

# Configuration
# Configuration
AUDIO_DIR = File.join(Dir.pwd, 'assets', 'audio')
REF_DIR = File.join(AUDIO_DIR, 'reference')
DATA_FILE = File.join(Dir.pwd, '_data', 'audio_files.yml')
REF_DATA_FILE = File.join(Dir.pwd, '_data', 'reference_files.yml')

puts "Scanning for audio files..."

# Ensure _data directory exists
Dir.mkdir(File.join(Dir.pwd, '_data')) unless File.directory?(File.join(Dir.pwd, '_data'))

def scan_audio(dir, extensions = ['.wav'])
  return [] unless File.directory?(dir)
  Dir.entries(dir).select do |f|
    File.file?(File.join(dir, f)) && extensions.any? { |ext| f.downcase.end_with?(ext) }
  end.sort
end

# Scan main audio files (WAV and AIFF)
audio_files = scan_audio(AUDIO_DIR, ['.wav', '.aiff', '.aif'])
File.open(DATA_FILE, 'w') { |f| f.write(audio_files.to_yaml) }
puts "Generated #{DATA_FILE} with #{audio_files.length} files."

# Scan reference files (WAV only)
ref_files = scan_audio(REF_DIR, ['.wav'])
File.open(REF_DATA_FILE, 'w') { |f| f.write(ref_files.to_yaml) }
puts "Generated #{REF_DATA_FILE} with #{ref_files.length} files."

