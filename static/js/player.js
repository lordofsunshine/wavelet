let videoPlayer;
let isPlaying = false;
let currentVolume = 1;
let isDragging = false;
let currentSong = null;
let uiElements = null;
let hasUserInteracted = false;

const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;
const VIDEO_LOAD_TIMEOUT = 10000;

function setupEventListeners() {
    const elements = {
        playPauseButton: document.getElementById('playPauseButton'),
        nextButton: document.getElementById('nextButton'),
        volumeButton: document.getElementById('volumeButton'),
        songInfo: document.getElementById('songInfo'),
        channelInfo: document.getElementById('channelInfo'),
        songDuration: document.getElementById('songDuration'),
        youtubeLink: document.getElementById('youtubeLink'),
        playerOverlay: document.getElementById('playerOverlay'),
        currentTime: document.getElementById('currentTime'),
        duration: document.getElementById('duration')
    };

    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Required element not found: ${key}`);
            return false;
        }
    }

    elements.playPauseButton.addEventListener('click', togglePlay);
    elements.nextButton.addEventListener('click', loadRandomSong);
    elements.volumeButton.addEventListener('click', toggleMute);
    
    videoPlayer = document.querySelector('#videoPlayer');
    if (!videoPlayer) {
        console.error('Video player element not found');
        return false;
    }
    
    document.addEventListener('click', () => {
        hasUserInteracted = true;
    }, { once: true });
    
    videoPlayer.addEventListener('loadedmetadata', () => {
        if (videoPlayer.duration && isFinite(videoPlayer.duration)) {
            updateDuration();
            if (hasUserInteracted) {
                videoPlayer.play().catch(error => {
                    console.error('Playback failed:', error);
                    showError('Playback failed. Please try again.');
                });
                isPlaying = true;
                updatePlayPauseButton();
            } else {
                showError('Click anywhere to start playback');
            }
        }
    });
    
    videoPlayer.addEventListener('error', (e) => {
        console.error('Video error:', videoPlayer.error);
        showError('Video playback error. Loading new song...');
        setTimeout(loadRandomSong, 2000);
    });
    
    videoPlayer.addEventListener('timeupdate', updateProgress);
    videoPlayer.addEventListener('ended', loadRandomSong);
    videoPlayer.addEventListener('loadeddata', hideLoading);
    
    const progressBar = document.querySelector('.progress-bar');
    let isProgressDragging = false;
    
    progressBar.addEventListener('mousedown', (e) => {
        isProgressDragging = true;
        updateVideoProgress(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isProgressDragging) {
            updateVideoProgress(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        isProgressDragging = false;
    });
    
    function updateVideoProgress(e) {
        if (videoPlayer.duration && isFinite(videoPlayer.duration)) {
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            videoPlayer.currentTime = pos * videoPlayer.duration;
        }
    }
    
    const volumeSlider = document.querySelector('.volume-slider');
    
    let isVolumeDragging = false;
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isVolumeDragging = true;
        updateVolume(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isVolumeDragging) {
            updateVolume(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        isVolumeDragging = false;
    });
    
    volumeSlider.addEventListener('click', updateVolume);
    
    return elements;
}

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.createElement('div');
    overlay.className = 'background-overlay';
    document.body.insertBefore(overlay, document.body.firstChild);
    
    uiElements = setupEventListeners();
    if (uiElements) {
        document.body.addEventListener('click', startPlayback, { once: true });
        loadRandomSong();
    }
});

function startPlayback() {
    hasUserInteracted = true;
    if (videoPlayer && videoPlayer.paused) {
        videoPlayer.play().catch(console.error);
        isPlaying = true;
        updatePlayPauseButton();
    }
}

function updateBackground(thumbnailUrl) {
    const overlay = document.querySelector('.background-overlay');
    overlay.style.opacity = '0';
    
    setTimeout(() => {
        overlay.style.backgroundImage = `url(${thumbnailUrl})`;
        overlay.style.opacity = '1';
    }, 500);
}

async function loadRandomSong() {
    if (!uiElements) return;

    showLoading();
    let retries = MAX_RETRIES;

    while (retries > 0) {
        try {
            console.log('Fetching random song...');
            const response = await fetch('/get_random_song', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to load song: ${errorData.error || 'Unknown error'}`);
            }
            
            const song = await response.json();
            
            if (!song?.url) {
                throw new Error('Invalid song data: missing URL');
            }

            videoPlayer.src = song.url;
            videoPlayer.volume = currentVolume;
            
            updatePlayerUI(song);
            hideLoading();
            
            if (hasUserInteracted) {
                try {
                    await videoPlayer.play();
                    isPlaying = true;
                    updatePlayPauseButton();
                } catch (playError) {
                    console.warn('Autoplay failed:', playError);
                    showError('Click to play');
                }
            }
            
            return;
            
        } catch (error) {
            console.error('Error:', error.message);
            retries--;
            
            if (retries === 0) {
                showError('Failed to load track. Please try again later.');
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function updatePlayerUI(song) {
    uiElements.songInfo.textContent = song.title;
    uiElements.channelInfo.textContent = `${song.channel} • ${song.views}`;
    uiElements.songDuration.textContent = song.duration;
    uiElements.youtubeLink.href = song.youtube_url;
    updateBackground(song.thumbnail);
}

function togglePlay() {
    if (videoPlayer.paused) {
        videoPlayer.play();
        isPlaying = true;
    } else {
        videoPlayer.pause();
        isPlaying = false;
    }
    updatePlayPauseButton();
}

function updatePlayPauseButton() {
    const icon = document.querySelector('#playPauseButton i');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
}

function setVolume(value) {
    currentVolume = Math.max(0, Math.min(1, value));
    videoPlayer.volume = currentVolume;
    videoPlayer.muted = false;
    updateVolumeUI();
}

function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
    updateVolumeUI();
}

function updateVolumeUI() {
    const icon = document.querySelector('#volumeButton i');
    const volumeFilled = document.querySelector('.volume-filled');
    const volume = videoPlayer.muted ? 0 : currentVolume;
    
    icon.className = volume === 0 ? 'fas fa-volume-mute' :
                    volume < 0.5 ? 'fas fa-volume-down' :
                    'fas fa-volume-up';
                    
    volumeFilled.style.width = `${volume * 100}%`;
}

function updateProgress() {
    if (videoPlayer.duration && isFinite(videoPlayer.duration)) {
        const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        document.querySelector('.progress-filled').style.width = `${progress}%`;
        document.getElementById('currentTime').textContent = formatTime(videoPlayer.currentTime);
    }
}

function updateDuration() {
    document.getElementById('duration').textContent = formatTime(videoPlayer.duration);
}

function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showLoading() {
    if (!uiElements) return;
    uiElements.playerOverlay.classList.add('visible');
    uiElements.songInfo.textContent = 'Searching for a new track...';
    uiElements.songInfo.style.color = 'var(--text-primary)';
    uiElements.channelInfo.textContent = '';
    uiElements.songDuration.textContent = '';
}

function hideLoading() {
    if (!uiElements) return;
    uiElements.playerOverlay.classList.remove('visible');
}

function showError(message) {
    console.error('Error:', message);
    if (uiElements) {
        uiElements.songInfo.textContent = message;
        uiElements.songInfo.style.color = '#ef4444';
        uiElements.channelInfo.textContent = '';
        uiElements.songDuration.textContent = '';
        hideLoading();
    }
}

function updateVolume(e) {
    const volumeSlider = document.querySelector('.volume-slider');
    const rect = volumeSlider.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(pos);
} 