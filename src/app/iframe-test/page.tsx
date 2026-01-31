'use client'

import { useState } from 'react'

export default function IframeTestPage() {
  const [showIframe, setShowIframe] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = () => {
    setIframeLoaded(true)
    setError(null)
  }

  const handleError = () => {
    setError('Erreur de chargement. Vérifie que l\'extension est installée et activée.')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">🧪 Test Iframe LinkedIn</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Installe l'extension Chrome (version mise à jour)</li>
            <li>Clique sur "Charger LinkedIn en iframe"</li>
            <li>Si ça marche, tu verras LinkedIn Messaging ci-dessous</li>
            <li>Si ça échoue, l'extension n'est pas bien configurée</li>
          </ol>
        </div>

        <div className="mb-6">
          <button
            onClick={() => setShowIframe(!showIframe)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            {showIframe ? '❌ Fermer l\'iframe' : '🚀 Charger LinkedIn en iframe'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {showIframe && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">LinkedIn Messaging (iframe)</h2>
              <span className={`px-3 py-1 rounded-full text-sm ${iframeLoaded ? 'bg-green-600' : 'bg-yellow-600'}`}>
                {iframeLoaded ? '✅ Chargé' : '⏳ Chargement...'}
              </span>
            </div>
            
            <div className="relative bg-white rounded-lg overflow-hidden" style={{ height: '600px' }}>
              <iframe
                src="https://www.linkedin.com/messaging/"
                className="w-full h-full border-0"
                onLoad={handleLoad}
                onError={handleError}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          </div>
        )}

        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Comment ça marche ?</h2>
          <div className="text-gray-300 space-y-2">
            <p>1. LinkedIn envoie normalement un header <code className="bg-gray-700 px-1 rounded">X-Frame-Options: SAMEORIGIN</code></p>
            <p>2. Ce header bloque le chargement dans une iframe d'un autre domaine</p>
            <p>3. Notre extension supprime ce header grâce à <code className="bg-gray-700 px-1 rounded">declarativeNetRequest</code></p>
            <p>4. Du coup, l'iframe peut charger LinkedIn normalement</p>
          </div>
        </div>
      </div>
    </div>
  )
}
