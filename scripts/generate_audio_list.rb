#!/usr/bin/env ruby
require 'yaml'
require 'json'

# Configuration
AUDIO_DIR = File.join(Dir.pwd, 'assets', 'audio')
DATA_FILE = File.join(Dir.pwd, '_data', 'audio_files.yml')

puts "Scanning for audio files in #{AUDIO_DIR}..."

# Ensure _data directory exists
Dir.mkdir(File.join(Dir.pwd, '_data')) unless File.directory?(File.join(Dir.pwd, '_data'))

if File.directory?(AUDIO_DIR)
  # Find all .wav files
  audio_files = Dir.entries(AUDIO_DIR).select do |f|
    File.file?(File.join(AUDIO_DIR, f)) && f.end_with?('.wav')
  end.sort

  # Write to YAML file
  File.open(DATA_FILE, 'w') do |file|
    file.write(audio_files.to_yaml)
  end

  puts "Successfully generated #{DATA_FILE} with #{audio_files.length} files."
  puts "Files found: #{audio_files.inspect}"
else
  puts "Warning: Audio directory not found at #{AUDIO_DIR}"
  File.open(DATA_FILE, 'w') { |f| f.write([].to_yaml) }
end
