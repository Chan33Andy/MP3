const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure downloads directory exists
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// API: Get video info
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const command = `yt-dlp --dump-json --no-download "${url}"`;
        
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('yt-dlp error:', error);
                return res.status(500).json({ error: 'Failed to fetch video info. Make sure yt-dlp is installed.' });
            }
            
            try {
                const info = JSON.parse(stdout);
                res.json({
                    title: info.title,
                    duration: info.duration,
                    author: info.uploader,
                    thumbnail: info.thumbnail
                });
            } catch (parseError) {
                res.status(500).json({ error: 'Failed to parse video info' });
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Download MP3
app.post('/api/download', async (req, res) => {
    const { url, bitrate } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const infoCommand = `yt-dlp --dump-json --no-download "${url}"`;
        
        exec(infoCommand, { maxBuffer: 10 * 1024 * 1024 }, (infoError, infoStdout) => {
            if (infoError) {
                return res.status(500).json({ error: 'Failed to get video info' });
            }
            
            try {
                const videoInfo = JSON.parse(infoStdout);
                const sanitizedTitle = videoInfo.title.replace(/[^\w\s\u4e00-\u9fff\-]/gi, '');
                const outputFileName = `${sanitizedTitle}_${bitrate}kbps_${Date.now()}.mp3`;
                const outputPath = path.join(DOWNLOAD_DIR, outputFileName);
                
                const downloadCommand = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality ${bitrate} -o "${outputPath}" "${url}"`;
                
                console.log(`Downloading: ${videoInfo.title} at ${bitrate}kbps`);
                
                exec(downloadCommand, { maxBuffer: 50 * 1024 * 1024 }, (downloadError) => {
                    if (downloadError) {
                        console.error('Download error:', downloadError);
                        return res.status(500).json({ error: 'Download failed. Make sure ffmpeg is installed.' });
                    }
                    
                    if (!fs.existsSync(outputPath)) {
                        return res.status(500).json({ error: 'File not generated' });
                    }
                    
                    res.download(outputPath, `${sanitizedTitle}.mp3`, (err) => {
                        if (err) console.error('Send error:', err);
                        setTimeout(() => {
                            fs.unlink(outputPath, () => {});
                        }, 5000);
                    });
                });
            } catch (parseError) {
                res.status(500).json({ error: 'Failed to process video' });
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Downloads folder: ${DOWNLOAD_DIR}\n`);
    console.log('Make sure you have installed:');
    console.log('  1. yt-dlp (pip install yt-dlp)');
    console.log('  2. ffmpeg (https://ffmpeg.org/download.html)\n');
});
