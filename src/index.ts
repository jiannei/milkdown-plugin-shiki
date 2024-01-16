import { $proseAsync } from '@milkdown/utils'
import { findChildren } from '@milkdown/prose'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Highlighter } from 'shikiji'
import { getHighlighter } from 'shikiji'
import type { Node } from '@milkdown/prose/model'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export interface FlattedNode {
  content: string
  color: string
}

function getDecorations(doc: Node, name: string, highlighter: Highlighter) {
  const decorations: Decoration[] = []

  const children = findChildren(node => node.type.name === name)(doc)

  children.forEach(async (block) => {
    let from = block.pos + 1
    const { language } = block.node.attrs

    if (!language)
      return

    const nodes = highlighter.codeToThemedTokens(block.node.textContent, {
      lang: language,
      theme: 'night-owl',
    }).map(token =>
      token.map(
        ({ content, color }) =>
          ({
            content,
            color,
          } as FlattedNode),
      ),
    )

    nodes.forEach((block) => {
      block.forEach((node) => {
        const to = from + node.content.length
        const decoration = Decoration.inline(from, to, {
          style: `color: ${node.color}`,
        })
        decorations.push(decoration)
        from = to
      })
      from += 1
    })
  })

  return DecorationSet.create(doc, decorations)
}

export const milkShiki = $proseAsync(async () => {
  const highlighter = await getHighlighter({
    themes: ['night-owl'],
    langs: ['javascript', 'tsx', 'markdown', 'php'],
  })
  const name = 'code_block'

  return new Plugin({
    key: new PluginKey('MILKDOWN_SHIKI'),
    state: {
      init: (_, { doc }) => getDecorations(doc, name, highlighter),
      apply: (transaction, decorationSet, oldState, state) => {
        const isNodeName = state.selection.$head.parent.type.name === name
        const isPreviousNodeName = oldState.selection.$head.parent.type.name === name
        const oldNode = findChildren(node => node.type.name === name)(oldState.doc)
        const newNode = findChildren(node => node.type.name === name)(state.doc)
        const codeBlockChanged = transaction.docChanged
          && (isNodeName
          || isPreviousNodeName
          || oldNode.length !== newNode.length
          || oldNode[0]?.node.attrs.language !== newNode[0]?.node.attrs.language
          || transaction.steps.some((step) => {
            const s = step as unknown as { from: number, to: number }
            return (
              s.from !== undefined
              && s.to !== undefined
              && oldNode.some((node) => {
                return node.pos >= s.from && node.pos + node.node.nodeSize <= s.to
              })
            )
          }))

        if (codeBlockChanged)
          return getDecorations(transaction.doc, name, highlighter)

        return decorationSet.map(transaction.mapping, transaction.doc)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
})
