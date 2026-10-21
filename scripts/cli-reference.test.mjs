import assert from 'node:assert/strict'
import {test} from 'node:test'
import {referenceFromManifest} from './cli-reference.mjs'

test('exports visible sorted commands and complete public metadata', () => {
  const output = referenceFromManifest({
    version: '1.2.3',
    commands: {
      internal: {hidden: true},
      'z:send': {
        description: 'Send a message.\nMore detail.',
        aliases: ['send', 'secret'],
        hiddenAliases: ['secret'],
        state: 'beta',
        args: {
          recipient: {
            required: true,
            description: 'Recipient.',
            options: ['a', 'b'],
          },
        },
        flags: {
          secret: {hidden: true},
          json: {type: 'boolean', default: false},
          kind: {
            char: 'k',
            type: 'option',
            required: true,
            multiple: true,
            default: ['a'],
            options: ['a', 'b'],
            description: 'Kind.',
            env: 'KIND',
            helpGroup: 'SEND',
          },
        },
        examples: [
          '<%= config.bin %> <%= command.id %> a',
          {
            command: '<%= config.bin %> <%= command.id %> b',
            description: 'Send to b.',
          },
        ],
      },
      a: {summary: 'First.', usage: ['polymorfa a']},
    },
  })
  assert.equal(output.schemaVersion, 1)
  assert.equal(output.cliVersion, '1.2.3')
  assert.deepEqual(
    output.commands.map(({id}) => id),
    ['a', 'z send'],
  )
  const command = output.commands[1]
  assert.equal(command.summary, 'Send a message.')
  assert.deepEqual(command.usage, ['polymorfa z send RECIPIENT [flags]'])
  assert.deepEqual(command.aliases, ['send'])
  assert.equal(command.state, 'beta')
  assert.equal(command.args[0].required, true)
  assert.deepEqual(command.flags[1], {
    name: 'kind',
    char: 'k',
    type: 'option',
    required: true,
    multiple: true,
    default: ['a'],
    options: ['a', 'b'],
    description: 'Kind.',
    env: 'KIND',
    helpGroup: 'SEND',
  })
  assert.equal(command.flags[0].default, false)
  assert.deepEqual(command.examples[0], {
    command: 'polymorfa z send a',
    description: '',
  })
  assert.deepEqual(command.examples[1], {
    command: 'polymorfa z send b',
    description: 'Send to b.',
  })
})
