import { useState, useEffect, useRef } from 'react';
import { loadConfigs, saveConfigs } from './data/sampleConfigs';
import Hls from 'hls.js';
import './index.css';

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
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

    useEffect(() => {
        setConfigs(loadConfigs());
    }, []);

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <span className="text-3xl">🎬</span>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            StreamInspector
                        </h1>
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
                                    <h3 className="text-lg font-semibold mb-2">Thumbnail</h3>
                                    <img
                                        src={selectedClip.clip.thumbnailUrl}
                                        alt="Thumbnail"
                                        className="w-full max-w-md rounded-lg border border-white/20"
                                    />
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
                                    <h3 className="text-lg font-semibold">Stream URL</h3>
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
                                <h3 className="text-lg font-semibold mb-2">Metadata</h3>
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
                                        </div>
                                    )}

                                    {showRawReg && registrationData && (
                                        <div className="space-y-3">
                                            <div>
                                                <h4 className="text-sm font-semibold text-white/80 mb-2">Left Registration (Raw JSON)</h4>
                                                <pre className="bg-black/60 rounded-lg p-4 overflow-auto max-h-96 text-xs text-green-300 font-mono">
                                                    {registrationData.left.raw}
                                                </pre>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold text-white/80 mb-2">Right Registration (Raw JSON)</h4>
                                                <pre className="bg-black/60 rounded-lg p-4 overflow-auto max-h-96 text-xs text-green-300 font-mono">
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
        </div>
    );
}

export default App;
