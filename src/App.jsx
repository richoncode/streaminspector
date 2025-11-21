import { useState, useEffect, useRef } from 'react';
import { loadConfigs, saveConfigs } from './data/sampleConfigs';
import Hls from 'hls.js';
import './index.css';

const APP_VERSION = 'v1.0.1-rev5';

function App() {
    const [configs, setConfigs] = useState([]);
    const [selectedConfig, setSelectedConfig] = useState(null);
    const [selectedClip, setSelectedClip] = useState(null);
    const [loading, setLoading] = useState(false);
    const [newConfigUrl, setNewConfigUrl] = useState('');
    const [m3u8Levels, setM3u8Levels] = useState([]);
    const [loadingM3u8, setLoadingM3u8] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [rawM3u8, setRawM3u8] = useState('');
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [registrationData, setRegistrationData] = useState(null);
    const [showRawReg, setShowRawReg] = useState(false);
    const [loadingReg, setLoadingReg] = useState(false);
    const [firstFrame, setFirstFrame] = useState(null);
    const [loadingFirstFrame, setLoadingFirstFrame] = useState(false);
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const leftRegScrollRef = useRef(null);
    const rightRegScrollRef = useRef(null);
    const frameExtractorVideoRef = useRef(null);
    const frameExtractorCanvasRef = useRef(null);

    useEffect(() => {
        setConfigs(loadConfigs());
    }, []);

    useEffect(() => {
        if (selectedClip?.clip?.strurl) {
            extractFirstFrame(selectedClip.clip.strurl);
        } else {
            setFirstFrame(null);
        }
    }, [selectedClip]);

    const fetchConfig = async (config) => {
        setLoading(true);
        try {
            const response = await fetch(config.url);
            const data = await response.json();

            const updatedConfig = {
                ...config,
                data,
                lastFetched: new Date().toISOString(),
            };

            const updatedConfigs = configs.map(c =>
                c.id === config.id ? updatedConfig : c
            );

            setConfigs(updatedConfigs);
            saveConfigs(updatedConfigs);
            setSelectedConfig(updatedConfig);
        } catch (error) {
            console.error('Error fetching config:', error);
            alert('Failed to fetch config');
        } finally {
            setLoading(false);
        }
    };

    const addConfig = () => {
        if (!newConfigUrl.trim()) return;

        const newConfig = {
            id: Date.now().toString(),
            name: `Config ${configs.length + 1}`,
            url: newConfigUrl.trim(),
            lastFetched: null,
            data: null,
        };

        const updatedConfigs = [...configs, newConfig];
        setConfigs(updatedConfigs);
        saveConfigs(updatedConfigs);
        setNewConfigUrl('');
    };

    const removeConfig = (configId) => {
        const updatedConfigs = configs.filter(c => c.id !== configId);
        setConfigs(updatedConfigs);
        saveConfigs(updatedConfigs);
        if (selectedConfig?.id === configId) {
            setSelectedConfig(null);
            setSelectedClip(null);
        }
    };

    const viewClipDetail = (sport, clip) => {
        setSelectedClip({ sport, clip });
        setM3u8Levels([]);
        setPlaying(false);
        setShowRaw(false);
        setRawM3u8('');
        setShowSummary(false);
        setSummary(null);
        setRegistrationData(null);
        setShowRawReg(false);
        if (clip.strurl) {
            fetchM3u8Levels(clip.strurl);
        }
        if (clip.regData?.leftReg && clip.regData?.rightReg) {
            fetchRegistrationData(clip.regData);
        }
    };

    const playVideo = () => {
        setPlaying(true);

        // Initialize HLS player after state update
        setTimeout(() => {
            if (videoRef.current && selectedClip?.clip.strurl) {
                const video = videoRef.current;
                const url = selectedClip.clip.strurl;

                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play();
                    });
                    hlsRef.current = hls;
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    video.src = url;
                    video.addEventListener('loadedmetadata', () => {
                        video.play();
                    });
                }
            }
        }, 100);
    };

    // Cleanup HLS on unmount or clip change
    useEffect(() => {
        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
        };
    }, [selectedClip]);

    const fetchM3u8Levels = async (url) => {
        setLoadingM3u8(true);
        try {
            const response = await fetch(url);
            const text = await response.text();
            setRawM3u8(text);
            const levels = parseM3u8(text);
            setM3u8Levels(levels);
        } catch (error) {
            console.error('Error fetching M3U8:', error);
        } finally {
            setLoadingM3u8(false);
        }
    };

    const parseM3u8 = (text) => {
        const levels = [];
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const bandwidth = line.match(/BANDWIDTH=(\d+)/);
                const resolution = line.match(/RESOLUTION=(\d+x\d+)/);
                const nextLine = lines[i + 1]?.trim();

                if (nextLine && !nextLine.startsWith('#')) {
                    levels.push({
                        bandwidth: bandwidth ? parseInt(bandwidth[1]) : null,
                        resolution: resolution ? resolution[1] : null,
                        url: nextLine,
                    });
                }
            }
        }

        return levels;
    };

    const fetchRegistrationData = async (regData) => {
        setLoadingReg(true);
        try {
            const [leftResponse, rightResponse] = await Promise.all([
                fetch(regData.leftReg),
                fetch(regData.rightReg)
            ]);

            const leftData = await leftResponse.json();
            const rightData = await rightResponse.json();

            // Analyze registration data
            const analysis = {
                left: {
                    data: leftData,
                    raw: JSON.stringify(leftData, null, 2),
                    summary: analyzeRegistration(leftData, 'Left')
                },
                right: {
                    data: rightData,
                    raw: JSON.stringify(rightData, null, 2),
                    summary: analyzeRegistration(rightData, 'Right')
                },
                comparison: compareRegistrations(leftData, rightData)
            };

            setRegistrationData(analysis);
        } catch (error) {
            console.error('Error fetching registration data:', error);
        } finally {
            setLoadingReg(false);
        }
    };

    const analyzeRegistration = (data, side) => {
        const summary = {
            hasIntrinsics: !!data.intrinsics,
            hasExtrinsics: !!data.extrinsics,
            hasDistortion: !!data.distortion,
            resolution: null,
            focalLength: null,
            principalPoint: null,
            worldPosition: null,
            worldViewDirection: null,
            misc: null,
            xyDistance: null,
            verticalTilt: null,
            groundPlanePoint: null,
        };

        if (data.intrinsics) {
            summary.focalLength = `fx: ${data.intrinsics.fx?.toFixed(2)}, fy: ${data.intrinsics.fy?.toFixed(2)}`;
            summary.principalPoint = `cx: ${data.intrinsics.cx?.toFixed(2)}, cy: ${data.intrinsics.cy?.toFixed(2)}`;
        }

        if (data.resolution) {
            summary.resolution = `${data.resolution.width}x${data.resolution.height}`;
        }

        if (data.world_position && Array.isArray(data.world_position)) {
            summary.worldPosition = data.world_position;
            const [x, y, z] = data.world_position;

            // Calculate XY distance to origin (0,0,0)
            summary.xyDistance = Math.sqrt(x * x + y * y);
        }

        if (data.world_view_direction && Array.isArray(data.world_view_direction)) {
            summary.worldViewDirection = data.world_view_direction;
            const [vx, vy, vz] = data.world_view_direction;

            // Calculate vertical tilt (down angle from horizontal)
            const horizontalMag = Math.sqrt(vx * vx + vy * vy);
            // Negative vz means looking down (z-up coordinate system)
            summary.verticalTilt = Math.atan2(-vz, horizontalMag) * (180 / Math.PI);

            // Calculate where camera is looking at on z=0 plane
            if (data.world_position && vz !== 0) {
                const [x, y, z] = data.world_position;
                // Ray: P(t) = position + t * direction
                // For z=0: z + t*vz = 0, so t = -z/vz
                const t = -z / vz;
                summary.groundPlanePoint = [
                    x + t * vx,
                    y + t * vy,
                    0
                ];
            }
        }

        if (data.misc) {
            summary.misc = data.misc;
        }

        return summary;
    };

    const compareRegistrations = (left, right) => {
        const comparison = {
            resolutionMatch: false,
            focalLengthDiff: null,
            cameraDistance: null,
            viewDirectionAngle: null,
            notes: []
        };

        // Compare resolutions
        if (left.resolution && right.resolution) {
            comparison.resolutionMatch =
                left.resolution.width === right.resolution.width &&
                left.resolution.height === right.resolution.height;

            if (comparison.resolutionMatch) {
                comparison.notes.push('✓ Resolutions match');
            } else {
                comparison.notes.push('⚠ Different resolutions detected');
            }
        }

        // Compare focal lengths
        if (left.intrinsics?.fx && right.intrinsics?.fx) {
            const diff = Math.abs(left.intrinsics.fx - right.intrinsics.fx);
            comparison.focalLengthDiff = diff.toFixed(2);

            if (diff < 1) {
                comparison.notes.push('✓ Focal lengths are nearly identical');
            } else {
                comparison.notes.push(`⚠ Focal length difference: ${diff.toFixed(2)}px`);
            }
        }

        // Calculate distance between cameras
        if (left.world_position && right.world_position) {
            const dx = left.world_position[0] - right.world_position[0];
            const dy = left.world_position[1] - right.world_position[1];
            const dz = left.world_position[2] - right.world_position[2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            comparison.cameraDistance = distance.toFixed(3);
            comparison.notes.push(`📏 Camera separation: ${distance.toFixed(3)} units`);
        }

        // Calculate vergence angle between view directions
        if (left.world_view_direction && right.world_view_direction) {
            const leftVec = left.world_view_direction;
            const rightVec = right.world_view_direction;

            // Dot product
            const dotProduct = leftVec[0] * rightVec[0] + leftVec[1] * rightVec[1] + leftVec[2] * rightVec[2];

            // Magnitudes
            const leftMag = Math.sqrt(leftVec[0] ** 2 + leftVec[1] ** 2 + leftVec[2] ** 2);
            const rightMag = Math.sqrt(rightVec[0] ** 2 + rightVec[1] ** 2 + rightVec[2] ** 2);

            // Angle in radians, then convert to degrees
            const cosAngle = dotProduct / (leftMag * rightMag);
            const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle))); // Clamp to [-1, 1]
            const angleDeg = angleRad * (180 / Math.PI);

            // Check if parallel (very small angle)
            if (angleDeg < 0.01) {
                comparison.viewDirectionAngle = 'parallel';
                comparison.notes.push('📐 Vergence: parallel');
            } else {
                comparison.viewDirectionAngle = angleDeg.toFixed(2);
                comparison.notes.push(`📐 Vergence: ${angleDeg.toFixed(2)}°`);
            }
        }

        // Check if both have distortion parameters
        if (left.distortion && right.distortion) {
            comparison.notes.push('✓ Both views have distortion correction');
        } else if (!left.distortion && !right.distortion) {
            comparison.notes.push('ℹ No distortion correction parameters');
        } else {
            comparison.notes.push('⚠ Only one view has distortion correction');
        }

        return comparison;
    };

    const analyzeSummary = async () => {
        setLoadingSummary(true);
        setShowSummary(true);

        try {
            const analysis = {
                playlistType: 'Unknown',
                variants: m3u8Levels.length,
                targetDuration: null,
                playlistVersion: null,
                codecs: [],
                segments: [],
                segmentInfo: null,
                totalDuration: null,
                startTime: null,
                endTime: null,
            };

            // Get timestamps from clip metadata
            if (selectedClip?.clip.timeSegments && selectedClip.clip.timeSegments.length > 0) {
                const timeSegment = selectedClip.clip.timeSegments[0];
                analysis.startTime = timeSegment.startWallTime;
                analysis.endTime = timeSegment.endWallTime;

                // Calculate total duration from timestamps
                if (timeSegment.startWallTime && timeSegment.endWallTime) {
                    const start = new Date(timeSegment.startWallTime);
                    const end = new Date(timeSegment.endWallTime);
                    const durationMs = end - start;
                    analysis.totalDuration = Math.floor(durationMs / 1000); // in seconds
                }
            }

            // Parse M3U8 for metadata
            const lines = rawM3u8.split('\n');
            for (const line of lines) {
                if (line.startsWith('#EXT-X-VERSION:')) {
                    analysis.playlistVersion = line.split(':')[1];
                }
                if (line.startsWith('#EXT-X-TARGETDURATION:')) {
                    analysis.targetDuration = parseInt(line.split(':')[1]);
                }
                if (line.includes('CODECS=')) {
                    const codecMatch = line.match(/CODECS="([^"]+)"/);
                    if (codecMatch && !analysis.codecs.includes(codecMatch[1])) {
                        analysis.codecs.push(codecMatch[1]);
                    }
                }
                if (line.startsWith('#EXTINF:')) {
                    analysis.segments.push(line);
                }
            }

            // Determine playlist type
            if (m3u8Levels.length > 0) {
                analysis.playlistType = 'Master Playlist (Adaptive)';
            } else if (analysis.segments.length > 0) {
                analysis.playlistType = 'Media Playlist';
            }

            // Try to fetch first segment for detailed info
            if (m3u8Levels.length > 0 && m3u8Levels[0].url) {
                try {
                    const baseUrl = selectedClip.clip.strurl.substring(0, selectedClip.clip.strurl.lastIndexOf('/'));
                    const variantUrl = m3u8Levels[0].url.startsWith('http')
                        ? m3u8Levels[0].url
                        : `${baseUrl}/${m3u8Levels[0].url}`;

                    const variantResponse = await fetch(variantUrl);
                    const variantText = await variantResponse.text();
                    const variantLines = variantText.split('\n');

                    let segmentUrl = null;
                    for (let i = 0; i < variantLines.length; i++) {
                        if (variantLines[i].startsWith('#EXTINF:')) {
                            const nextLine = variantLines[i + 1]?.trim();
                            if (nextLine && !nextLine.startsWith('#')) {
                                segmentUrl = nextLine.startsWith('http')
                                    ? nextLine
                                    : `${baseUrl}/${nextLine}`;
                                break;
                            }
                        }
                    }

                    if (segmentUrl) {
                        const segmentResponse = await fetch(segmentUrl, { method: 'HEAD' });
                        analysis.segmentInfo = {
                            url: segmentUrl,
                            size: segmentResponse.headers.get('content-length'),
                            type: segmentResponse.headers.get('content-type'),
                        };
                    }
                } catch (err) {
                    console.error('Error fetching segment info:', err);
                }
            }

            setSummary(analysis);
        } catch (error) {
            console.error('Error analyzing summary:', error);
        } finally {
            setLoadingSummary(false);
        }
    };

    const handleRegScrollSync = (sourceRef, targetRef) => (e) => {
        if (targetRef.current && sourceRef.current) {
            // Sync scroll position from source to target
            targetRef.current.scrollTop = sourceRef.current.scrollTop;
            targetRef.current.scrollLeft = sourceRef.current.scrollLeft;
        }
    };

    const [firstFrameError, setFirstFrameError] = useState(null);

    const extractFirstFrame = async (m3u8Url, attempt = 0) => {
        console.log(`extractFirstFrame called with: ${m3u8Url}, attempt: ${attempt}`);
        if (attempt === 0) {
            setLoadingFirstFrame(true);
            setFirstFrame(null);
            setFirstFrameError(null);
        }

        const video = frameExtractorVideoRef.current;
        const canvas = frameExtractorCanvasRef.current;

        console.log('Refs:', { video: !!video, canvas: !!canvas });

        if (!video || !canvas) {
            console.error('Video or canvas ref is null');
            if (attempt < 3) {
                console.log('Retrying extraction in 100ms...');
                setTimeout(() => extractFirstFrame(m3u8Url, attempt + 1), 100);
                return;
            }
            setFirstFrameError('Internal Error: Video/Canvas ref null');
            setLoadingFirstFrame(false);
            return;
        }

        let hls = null;

        const captureFrame = async () => {
            // Wait for seek to complete
            await new Promise((resolve) => {
                if (video.seeking) {
                    video.addEventListener('seeked', () => resolve(), { once: true });
                } else {
                    resolve();
                }
            });

            // Small delay to ensure rendering
            await new Promise(r => requestAnimationFrame(r));

            console.log('Video dimensions:', video.videoWidth, video.videoHeight);

            if (video.videoWidth === 0 || video.videoHeight === 0) {
                throw new Error('Video dimensions are 0');
            }

            // Draw frame
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 360;
            const ctx = canvas.getContext('2d', { alpha: true });

            // Clear canvas with transparency
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Apply mask if available
            if (selectedClip?.clip?.maskUrl) {
                try {
                    const maskImg = new Image();
                    maskImg.crossOrigin = "anonymous";
                    await new Promise((resolve, reject) => {
                        maskImg.onload = resolve;
                        maskImg.onerror = reject;
                        maskImg.src = selectedClip.clip.maskUrl;
                    });

                    // Mask is Side-by-Side (Left | Right)
                    // Video is Top-Bottom (Top=Left, Bottom=Right)

                    const vw = canvas.width;
                    const vh = canvas.height;
                    const eyeHeight = vh / 2;
                    const eyeWidth = vw;

                    const mw = maskImg.width;
                    const mh = maskImg.height;
                    const maskEyeWidth = mw / 2;

                    // Store the original video frame
                    const videoFrame = ctx.getImageData(0, 0, vw, vh);

                    // Clear the main canvas
                    ctx.clearRect(0, 0, vw, vh);

                    // Process each eye separately
                    for (let eye = 0; eye < 2; eye++) {
                        // Create temporary canvas for this eye
                        const eyeCanvas = document.createElement('canvas');
                        eyeCanvas.width = eyeWidth;
                        eyeCanvas.height = eyeHeight;
                        const eyeCtx = eyeCanvas.getContext('2d', { alpha: true });

                        // --- draw mask for this eye ---
                        eyeCtx.globalCompositeOperation = "source-over";
                        eyeCtx.drawImage(
                            maskImg,
                            eye * maskEyeWidth, 0,           // src x,y (left or right half)
                            maskEyeWidth, mh,                // src w,h
                            0, 0,
                            eyeWidth, eyeHeight              // dst w,h
                        );

                        // convert mask luminance into alpha
                        const imgData = eyeCtx.getImageData(0, 0, eyeWidth, eyeHeight);
                        const data = imgData.data;
                        for (let i = 0; i < data.length; i += 4) {
                            const r = data[i];               // grayscale mask → use red channel
                            data[i + 3] = r;                 // alpha = mask
                            data[i] = data[i + 1] = data[i + 2] = 255;  // (RGB doesn't matter)
                        }
                        eyeCtx.putImageData(imgData, 0, 0);

                        // --- use mask to cut video for this eye ---
                        eyeCtx.globalCompositeOperation = "source-in";
                        const videoSrcY = eye * eyeHeight; // top (0) or bottom (eyeHeight)

                        // Create a temporary canvas from the stored video frame
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = vw;
                        tempCanvas.height = vh;
                        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
                        tempCtx.putImageData(videoFrame, 0, 0);

                        eyeCtx.drawImage(
                            tempCanvas,
                            0, videoSrcY, vw, eyeHeight,     // src rect in TB video
                            0, 0, eyeWidth, eyeHeight        // dst
                        );

                        // Draw the masked eye back to main canvas
                        const destY = eye * eyeHeight;
                        ctx.drawImage(eyeCanvas, 0, destY);
                    }

                } catch (e) {
                    console.error('Error applying mask:', e);
                    // Continue without mask if it fails
                }
            }

            try {
                const frameDataUrl = canvas.toDataURL('image/png');
                console.log('Frame extracted, length:', frameDataUrl.length);
                setFirstFrame(frameDataUrl);
            } catch (e) {
                console.error('Canvas toDataURL error:', e);
                throw new Error(`Canvas Security Error: ${e.message}`);
            }
        };

        try {
            if (Hls.isSupported()) {
                console.log('Hls is supported');
                hls = new Hls({
                    enableWorker: false,
                    startLevel: 0,
                    autoStartLoad: true,
                    capLevelToPlayerSize: true
                });

                hls.loadSource(m3u8Url);
                hls.attachMedia(video);

                await new Promise((resolve, reject) => {
                    const onManifestParsed = () => {
                        console.log('Manifest parsed');
                        video.muted = true;
                        // We don't need to play, just load enough to seek
                        video.currentTime = 0.1; // Seek slightly into the video
                    };

                    const onError = (event, data) => {
                        console.log('HLS Error event:', data.type, data.details);
                        if (data.fatal) {
                            reject(new Error(`HLS Error: ${data.type} - ${data.details}`));
                        }
                    };

                    const onSeeked = () => {
                        console.log('HLS: seeked event');
                        resolve();
                    }

                    hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                    hls.on(Hls.Events.ERROR, onError);
                    video.addEventListener('seeked', onSeeked, { once: true });

                    const timeout = setTimeout(() => {
                        console.error('Timeout waiting for video data');
                        cleanup();
                        reject(new Error('Timeout waiting for video data (10s)'));
                    }, 10000);

                    const cleanup = () => {
                        clearTimeout(timeout);
                        hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                        hls.off(Hls.Events.ERROR, onError);
                        video.removeEventListener('seeked', onSeeked);
                    };
                });

                await captureFrame();

            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                console.log('Using native HLS');
                // Native HLS (Safari)
                video.src = m3u8Url;
                video.muted = true;
                video.currentTime = 0.1;

                await new Promise((resolve, reject) => {
                    const onSeeked = () => {
                        console.log('Native: seeked');
                        resolve();
                    };
                    const onError = () => reject(new Error('Video error'));

                    video.addEventListener('seeked', onSeeked, { once: true });
                    video.addEventListener('error', onError, { once: true });

                    // Add timeout for native HLS as well
                    setTimeout(() => reject(new Error('Timeout waiting for native video data')), 10000);
                });

                await captureFrame();
            } else {
                throw new Error('HLS not supported');
            }
        } catch (error) {
            console.error('Error extracting first frame:', error);
            setFirstFrameError(error.message);
        } finally {
            if (hls) {
                hls.destroy();
            }
            video.removeAttribute('src');
            video.load();
            setLoadingFirstFrame(false);
            console.log('extractFirstFrame finished');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <span className="text-3xl">🎬</span>
                        <div className="flex items-baseline gap-2">
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                StreamInspector
                            </h1>
                            <span className="text-xs text-white/30 font-mono">{APP_VERSION}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => selectedClip ? setSelectedClip(null) : setSelectedConfig(null)}
                        className="text-sm text-white/60 hover:text-white transition"
                    >
                        ← {selectedClip ? 'Back to Clips' : 'Back to Configs'}
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-6">
                {!selectedConfig && !selectedClip && (
                    <div>
                        {/* Add Config Form */}
                        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 mb-6">
                            <h2 className="text-xl font-bold mb-4">Add New Config</h2>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    placeholder="Enter config URL..."
                                    value={newConfigUrl}
                                    onChange={(e) => setNewConfigUrl(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addConfig()}
                                    className="flex-1 bg-black/20 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                                <button
                                    onClick={addConfig}
                                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Config List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {configs.map(config => (
                                <div
                                    key={config.id}
                                    className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:bg-white/10 transition group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-bold text-lg">{config.name}</h3>
                                        <button
                                            onClick={() => removeConfig(config.id)}
                                            className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <p className="text-sm text-white/60 mb-4 truncate">{config.url}</p>
                                    {config.lastFetched && (
                                        <p className="text-xs text-white/40 mb-3">
                                            Last fetched: {new Date(config.lastFetched).toLocaleString()}
                                        </p>
                                    )}
                                    {config.data && (
                                        <p className="text-sm text-green-400 mb-3">
                                            {config.data.length} sports found
                                        </p>
                                    )}
                                    <button
                                        onClick={() => config.data ? setSelectedConfig(config) : fetchConfig(config)}
                                        disabled={loading}
                                        className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg font-medium transition disabled:opacity-50"
                                    >
                                        {loading ? 'Loading...' : config.data ? 'View Details' : 'Load Config'}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {configs.length === 0 && (
                            <div className="text-center py-20 text-white/40">
                                <p className="text-xl">No configs yet. Add one above!</p>
                            </div>
                        )}
                    </div>
                )}

                {selectedConfig && !selectedClip && (
                    <div className="space-y-6">
                        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                            <h2 className="text-2xl font-bold mb-2">{selectedConfig.name}</h2>
                            <p className="text-white/60 text-sm">{selectedConfig.url}</p>
                        </div>

                        {selectedConfig.data?.map((sport, idx) => (
                            <div key={idx} className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                                <h3 className="text-xl font-bold mb-4 capitalize">{sport.sport}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {sport.games?.map((game, gameIdx) =>
                                        game.clips?.map((clip, clipIdx) => (
                                            <div
                                                key={`${gameIdx}-${clipIdx}`}
                                                onClick={() => viewClipDetail(sport.sport, clip)}
                                                className="bg-black/20 rounded-lg p-4 hover:bg-black/30 cursor-pointer transition border border-white/5"
                                            >
                                                {clip.thumbnailUrl && (
                                                    <img
                                                        src={clip.thumbnailUrl}
                                                        alt="Thumbnail"
                                                        className="w-full h-32 object-cover rounded mb-3"
                                                    />
                                                )}
                                                <p className="text-sm font-medium">Clip ID: {clip.id}</p>
                                                <p className="text-xs text-white/60">Game: {clip.gid}</p>
                                                <p className="text-xs text-white/60 mt-2">{clip.mediaType}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {selectedClip && (
                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10 max-w-4xl mx-auto">
                        <h2 className="text-2xl font-bold mb-6 capitalize">{selectedClip.sport} - Clip Details</h2>

                        <div className="space-y-6">
                            {/* Thumbnail */}
                            {selectedClip.clip.thumbnailUrl && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Thumbnail & First Frame</h3>
                                    <div className="flex gap-4">
                                        <div>
                                            <p className="text-sm text-white/60 mb-1">Thumbnail</p>
                                            <img
                                                src={selectedClip.clip.thumbnailUrl}
                                                alt="Thumbnail"
                                                className="w-full max-w-md rounded-lg border border-white/20"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-sm text-white/60 mb-1">First Frame</p>
                                            {loadingFirstFrame ? (
                                                <div className="w-full max-w-md aspect-video rounded-lg border border-white/20 bg-black/40 flex items-center justify-center">
                                                    <div className="text-gray-400 italic">Extracting frame...</div>
                                                </div>
                                            ) : firstFrame ? (
                                                <img
                                                    src={firstFrame}
                                                    alt="First Frame"
                                                    className="w-full max-w-md rounded-lg border border-white/20"
                                                />
                                            ) : (
                                                <div className="w-full max-w-md aspect-video rounded-lg border border-white/20 bg-black/40 flex items-center justify-center">
                                                    <div className="text-gray-500 italic">
                                                        {firstFrameError ? (
                                                            <span className="text-red-400">Error: {firstFrameError}</span>
                                                        ) : (
                                                            "No frame available"
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Mask */}
                            {selectedClip.clip.maskUrl && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Mask</h3>
                                    <img
                                        src={selectedClip.clip.maskUrl}
                                        alt="Mask"
                                        className="w-full max-w-md rounded-lg border border-white/20 bg-black/50"
                                    />
                                </div>
                            )}

                            {/* Video URL */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-semibold">Video URL</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={analyzeSummary}
                                            disabled={loadingSummary}
                                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg font-medium transition disabled:opacity-50"
                                        >
                                            {loadingSummary ? 'Analyzing...' : 'Summary'}
                                        </button>
                                        <button
                                            onClick={() => setShowRaw(!showRaw)}
                                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition"
                                        >
                                            {showRaw ? 'Hide' : 'RAW'}
                                        </button>
                                        <button
                                            onClick={playVideo}
                                            disabled={playing}
                                            className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50"
                                        >
                                            ▶ {playing ? 'Playing' : 'Play'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-black/40 rounded-lg p-4 font-mono text-sm break-all">
                                    <a
                                        href={selectedClip.clip.strurl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        {selectedClip.clip.strurl}
                                    </a>
                                </div>

                                {/* Summary Analysis */}
                                {showSummary && summary && (
                                    <div className="mt-4 bg-black/40 rounded-lg p-4 space-y-3">
                                        <h4 className="text-sm font-semibold text-white mb-2">Stream Analysis</h4>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            {summary.totalDuration && (
                                                <div>
                                                    <span className="text-white/60">Total Duration:</span>
                                                    <p className="text-white font-medium">{Math.floor(summary.totalDuration / 60)}m {summary.totalDuration % 60}s</p>
                                                </div>
                                            )}
                                            {summary.targetDuration && (
                                                <div>
                                                    <span className="text-white/60">Max Segment Size:</span>
                                                    <p className="text-white font-medium">{summary.targetDuration}s</p>
                                                </div>
                                            )}
                                            {summary.segments.length > 0 && (
                                                <div>
                                                    <span className="text-white/60">Segments:</span>
                                                    <p className="text-white font-medium">{summary.segments.length}</p>
                                                </div>
                                            )}
                                            {summary.startTime && (
                                                <div>
                                                    <span className="text-white/60">Start Time:</span>
                                                    <p className="text-white font-medium text-xs">{new Date(summary.startTime).toLocaleString()}</p>
                                                </div>
                                            )}
                                            {summary.endTime && (
                                                <div>
                                                    <span className="text-white/60">End Time:</span>
                                                    <p className="text-white font-medium text-xs">{new Date(summary.endTime).toLocaleString()}</p>
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-white/60">Playlist Type:</span>
                                                <p className="text-white font-medium">{summary.playlistType}</p>
                                            </div>
                                            {summary.playlistVersion && (
                                                <div>
                                                    <span className="text-white/60">HLS Version:</span>
                                                    <p className="text-white font-medium">{summary.playlistVersion}</p>
                                                </div>
                                            )}
                                            {summary.variants > 0 && (
                                                <div>
                                                    <span className="text-white/60">Variants:</span>
                                                    <p className="text-white font-medium">{summary.variants}</p>
                                                </div>
                                            )}
                                        </div>

                                        {summary.codecs.length > 0 && (
                                            <div>
                                                <span className="text-white/60 text-sm">Codecs:</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {summary.codecs.map((codec, idx) => (
                                                        <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">
                                                            {codec}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {summary.segmentInfo && (
                                            <div className="border-t border-white/10 pt-3 mt-3">
                                                <h5 className="text-xs font-semibold text-white/80 mb-2">Sample Segment Info</h5>
                                                <div className="text-xs space-y-1">
                                                    <p><span className="text-white/60">Type:</span> {summary.segmentInfo.type || 'Unknown'}</p>
                                                    {summary.segmentInfo.size && (
                                                        <p><span className="text-white/60">Size:</span> {(summary.segmentInfo.size / 1024 / 1024).toFixed(2)} MB</p>
                                                    )}
                                                    <p className="text-white/40 truncate"><span className="text-white/60">URL:</span> {summary.segmentInfo.url}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Raw M3U8 Content */}
                                {showRaw && rawM3u8 && (
                                    <div className="mt-4">
                                        <h4 className="text-sm font-semibold text-white/80 mb-2">Raw M3U8 File Content</h4>
                                        <pre className="bg-black/60 rounded-lg p-4 overflow-auto max-h-96 text-xs text-green-300 font-mono">
                                            {rawM3u8}
                                        </pre>
                                    </div>
                                )}

                                {/* Video Player */}
                                {playing && (
                                    <div className="mt-4">
                                        <video
                                            ref={videoRef}
                                            controls
                                            className="w-full max-w-4xl rounded-lg bg-black"
                                            style={{ maxHeight: '600px' }}
                                        />
                                    </div>
                                )}

                                {/* Ladder Levels */}
                                {loadingM3u8 && (
                                    <p className="text-white/60 text-sm mt-3">Loading ladder levels...</p>
                                )}
                                {m3u8Levels.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="text-sm font-semibold text-white/80 mb-2">Ladder Levels ({m3u8Levels.length})</h4>
                                        <div className="space-y-2">
                                            {m3u8Levels.map((level, idx) => (
                                                <div key={idx} className="bg-black/60 rounded-lg p-3 text-xs">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-white/80 font-medium">Level {idx + 1}</span>
                                                        {level.resolution && (
                                                            <span className="text-green-400">{level.resolution}</span>
                                                        )}
                                                    </div>
                                                    {level.bandwidth && (
                                                        <p className="text-white/60">Bandwidth: {(level.bandwidth / 1000000).toFixed(2)} Mbps</p>
                                                    )}
                                                    <p className="text-white/40 truncate mt-1">{level.url}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Video Metadata</h3>
                                <div className="bg-black/40 rounded-lg p-4 space-y-1 text-sm">
                                    <p><span className="text-white/60">Clip ID:</span> {selectedClip.clip.id}</p>
                                    <p><span className="text-white/60">Game ID:</span> {selectedClip.clip.gid}</p>
                                    <p><span className="text-white/60">League:</span> {selectedClip.clip.lid}</p>
                                    <p><span className="text-white/60">Season:</span> {selectedClip.clip.sid}</p>
                                    <p><span className="text-white/60">Media Type:</span> {selectedClip.clip.mediaType}</p>
                                </div>
                            </div>

                            {/* Registration Data */}
                            {selectedClip.clip.regData?.leftReg && selectedClip.clip.regData?.rightReg && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-lg font-semibold">Registration</h3>
                                        {registrationData && (
                                            <button
                                                onClick={() => setShowRawReg(!showRawReg)}
                                                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-sm font-medium transition"
                                            >
                                                {showRawReg ? 'Hide' : 'RAW'}
                                            </button>
                                        )}
                                    </div>

                                    {loadingReg && (
                                        <p className="text-white/60 text-sm">Loading registration data...</p>
                                    )}

                                    {registrationData && !showRawReg && (
                                        <div className="bg-black/40 rounded-lg p-4 space-y-4">
                                            {/* Summary Grid */}
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                {/* Left View */}
                                                <div>
                                                    <h4 className="text-white/80 font-semibold mb-2">Left View</h4>
                                                    {registrationData.left.summary.resolution && (
                                                        <p className="text-xs"><span className="text-white/60">Resolution:</span> {registrationData.left.summary.resolution}</p>
                                                    )}
                                                    {registrationData.left.summary.focalLength && (
                                                        <p className="text-xs"><span className="text-white/60">Focal Length:</span> {registrationData.left.summary.focalLength}</p>
                                                    )}
                                                    {registrationData.left.summary.principalPoint && (
                                                        <p className="text-xs"><span className="text-white/60">Principal Point:</span> {registrationData.left.summary.principalPoint}</p>
                                                    )}
                                                    {registrationData.left.summary.worldPosition && (
                                                        <p className="text-xs"><span className="text-white/60">World Position:</span> [{registrationData.left.summary.worldPosition.map(v => v.toFixed(2)).join(', ')}]</p>
                                                    )}
                                                    {registrationData.left.summary.worldViewDirection && (
                                                        <p className="text-xs"><span className="text-white/60">View Direction:</span> [{registrationData.left.summary.worldViewDirection.map(v => v.toFixed(4)).join(', ')}]</p>
                                                    )}
                                                    {registrationData.left.summary.xyDistance !== null && (
                                                        <p className="text-xs"><span className="text-white/60">XY Distance:</span> {registrationData.left.summary.xyDistance.toFixed(3)} units</p>
                                                    )}
                                                    {registrationData.left.summary.verticalTilt !== null && (
                                                        <p className="text-xs"><span className="text-white/60">Vertical Tilt:</span> {registrationData.left.summary.verticalTilt.toFixed(2)}° down</p>
                                                    )}
                                                    {registrationData.left.summary.groundPlanePoint && (
                                                        <p className="text-xs"><span className="text-white/60">Ground Point (z=0):</span> [{registrationData.left.summary.groundPlanePoint.map(v => v.toFixed(2)).join(', ')}]</p>
                                                    )}
                                                </div>

                                                {/* Right View */}
                                                <div>
                                                    <h4 className="text-white/80 font-semibold mb-2">Right View</h4>
                                                    {registrationData.right.summary.resolution && (
                                                        <p className="text-xs"><span className="text-white/60">Resolution:</span> {registrationData.right.summary.resolution}</p>
                                                    )}
                                                    {registrationData.right.summary.focalLength && (
                                                        <p className="text-xs"><span className="text-white/60">Focal Length:</span> {registrationData.right.summary.focalLength}</p>
                                                    )}
                                                    {registrationData.right.summary.principalPoint && (
                                                        <p className="text-xs"><span className="text-white/60">Principal Point:</span> {registrationData.right.summary.principalPoint}</p>
                                                    )}
                                                    {registrationData.right.summary.worldPosition && (
                                                        <p className="text-xs"><span className="text-white/60">World Position:</span> [{registrationData.right.summary.worldPosition.map(v => v.toFixed(2)).join(', ')}]</p>
                                                    )}
                                                    {registrationData.right.summary.worldViewDirection && (
                                                        <p className="text-xs"><span className="text-white/60">View Direction:</span> [{registrationData.right.summary.worldViewDirection.map(v => v.toFixed(4)).join(', ')}]</p>
                                                    )}
                                                    {registrationData.right.summary.xyDistance !== null && (
                                                        <p className="text-xs"><span className="text-white/60">XY Distance:</span> {registrationData.right.summary.xyDistance.toFixed(3)} units</p>
                                                    )}
                                                    {registrationData.right.summary.verticalTilt !== null && (
                                                        <p className="text-xs"><span className="text-white/60">Vertical Tilt:</span> {registrationData.right.summary.verticalTilt.toFixed(2)}° down</p>
                                                    )}
                                                    {registrationData.right.summary.groundPlanePoint && (
                                                        <p className="text-xs"><span className="text-white/60">Ground Point (z=0):</span> [{registrationData.right.summary.groundPlanePoint.map(v => v.toFixed(2)).join(', ')}]</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Comparison */}
                                            {registrationData.comparison.notes.length > 0 && (
                                                <div className="border-t border-white/10 pt-3">
                                                    <h5 className="text-xs font-semibold text-white/80 mb-2">Analysis</h5>
                                                    <div className="space-y-1">
                                                        {registrationData.comparison.notes.map((note, idx) => (
                                                            <p key={idx} className="text-xs text-white/70">{note}</p>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Misc Messages */}
                                            {(registrationData.left.summary.misc || registrationData.right.summary.misc) && (
                                                <div className="border-t border-white/10 pt-3">
                                                    <h5 className="text-xs font-semibold text-white/80 mb-2">Camera Info</h5>
                                                    <div className="space-y-2">
                                                        {registrationData.left.summary.misc && (
                                                            <div className="bg-blue-500/10 rounded p-2 border border-blue-500/20">
                                                                <p className="text-xs text-blue-300 font-medium mb-1">Left:</p>
                                                                <p className="text-xs text-white/80">{registrationData.left.summary.misc}</p>
                                                            </div>
                                                        )}
                                                        {registrationData.right.summary.misc && (
                                                            <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
                                                                <p className="text-xs text-green-300 font-medium mb-1">Right:</p>
                                                                <p className="text-xs text-white/80">{registrationData.right.summary.misc}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {showRawReg && registrationData && (
                                        <div className="space-y-3">
                                            <div>
                                                <h4 className="text-sm font-semibold text-white/80 mb-2">Left Registration (Raw JSON)</h4>
                                                <pre
                                                    ref={leftRegScrollRef}
                                                    onScroll={handleRegScrollSync(leftRegScrollRef, rightRegScrollRef)}
                                                    className="bg-black/60 rounded-lg p-4 overflow-auto max-h-96 text-xs text-green-300 font-mono"
                                                >
                                                    {registrationData.left.raw}
                                                </pre>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold text-white/80 mb-2">Right Registration (Raw JSON)</h4>
                                                <pre
                                                    ref={rightRegScrollRef}
                                                    onScroll={handleRegScrollSync(rightRegScrollRef, leftRegScrollRef)}
                                                    className="bg-black/60 rounded-lg p-4 overflow-auto max-h-96 text-xs text-green-300 font-mono"
                                                >
                                                    {registrationData.right.raw}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Raw JSON */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Raw JSON</h3>
                                <pre className="bg-black/40 rounded-lg p-4 overflow-auto max-h-96 text-xs">
                                    {JSON.stringify(selectedClip.clip, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Hidden elements for first frame extraction */}
            <video
                ref={frameExtractorVideoRef}
                crossOrigin="anonymous"
                playsInline
                style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}
            />
            <canvas
                ref={frameExtractorCanvasRef}
                style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}
            />
        </div>
    );
}

export default App;
