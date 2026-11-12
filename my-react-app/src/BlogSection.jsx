import { useEffect, useState } from 'react'
import Reveal from './Reveal'
import jellyfishCoder from './assets/jellyfish-coder.svg'

const textOf = (item, tag) => item.getElementsByTagName(tag)[0]?.textContent?.trim() || ''

// The blog publishes an RSS feed on the same site, so the newest posts show up
// here without rebuilding the portfolio.
function useLatestPosts(limit = 3) {
  const [posts, setPosts] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('/blog/feed.xml')
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(res.statusText))))
      .then((xml) => {
        const doc = new DOMParser().parseFromString(xml, 'application/xml')
        const items = [...doc.getElementsByTagName('item')].slice(0, limit).map((item) => {
          const link = textOf(item, 'link')
          let href = link
          try {
            href = new URL(link).pathname
          } catch {
            /* keep link as-is */
          }
          const date = new Date(textOf(item, 'pubDate'))
          return {
            title: textOf(item, 'title'),
            href,
            summary: textOf(item, 'description'),
            category: textOf(item, 'category'),
            date: Number.isNaN(date.getTime())
              ? ''
              : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          }
        })
        if (!cancelled) setPosts(items)
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
    return () => {
      cancelled = true
    }
  }, [limit])
  return posts
}

export default function BlogSection() {
  const posts = useLatestPosts()

  return (
    <section id="blog" className="blog-section">
      <div className="container">
        <Reveal>
          <div className="blog-section-head">
            <img className="blog-section-jelly" src={jellyfishCoder} alt="" width="96" height="96" />
            <div>
              <h2>From the Blog</h2>
              <p className="section-copy">
                Notes on what I&apos;m building, learning, and figuring out along the way.
              </p>
            </div>
          </div>
        </Reveal>

        {posts && posts.length > 0 && (
          <div className="blog-section-grid">
            {posts.map((post, index) => (
              <Reveal key={post.href} delay={index * 60}>
                <a className="blog-post-card" href={post.href}>
                  <span className="blog-post-meta">
                    {[post.category, post.date].filter(Boolean).join(' · ')}
                  </span>
                  <strong>{post.title}</strong>
                  {post.summary && <p>{post.summary}</p>}
                  <span className="blog-post-read">Read article →</span>
                </a>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal delay={120}>
          <div className="blog-section-actions">
            <a href="/blog" className="btn btn-outline">
              Read the blog
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
