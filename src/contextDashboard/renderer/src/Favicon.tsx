import React, { useState } from 'react'
import { Globe } from 'lucide-react'

interface FaviconProps {
    src?: string | null
    className?: string
}

export const Favicon: React.FC<FaviconProps> = ({ src, className }) => {
    const [error, setError] = useState(false)

    if (!src || error) {
        return <Globe className={`size-4 text-muted-foreground ${className ?? ''}`} />
    }

    return (
        <div className="flex size-4 items-center justify-center overflow-hidden rounded-sm">
            <img
                src={src}
                className="size-full object-contain"
                onError={() => setError(true)}
                alt=""
            />
        </div>
    )
}

export const getFaviconUrl = (url: string): string | null => {
    try {
        const domain = new URL(url).hostname
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
        return null
    }
}
