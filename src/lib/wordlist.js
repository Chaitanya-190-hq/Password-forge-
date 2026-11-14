/**
 * Bundled passphrase wordlist (short, unambiguous, lowercase English words).
 * Kept in the repository so passphrase generation works fully offline.
 * Duplicates are removed below; entropy is computed from the final list size.
 */
const RAW_WORDS = `
acorn amber anchor anvil apex apricot arbor archer arctic argon aspen atlas autumn
azure badge bamboo banner barley basalt basil basin bayou beacon beam berry beryl birch
bishop bison blade blaze bloom bluffs board boat bramble brass breeze brick bridge
brine brook bronze brush bulb bundle burrow cabin cable cactus cadet cairn calling
calm canal candle canoe canyon canvas caper carbon cargo carol carrot cascade cashew
castle cedar cello chalk chamber chapel charm chasm chestnut chime chimney chorus
cinder cipher circle citadel citrus clarity clover coast cobalt cobble cocoa comet
compass copper coral core cosmos cotton cove cradle crane crater crayon creek crest
crimson crystal cubit current cypress dagger dahlia dairy dawn delta denim desert
dial diamond diary digital dill dune dusk eagle earth easel echo eclipse elder elk
elm ember emerald engine epoch equinox estate ether falcon fallow fennel fern ferry
fiber fiddle field fig finch fjord flag flannel flare flint flock flora flute fog
foil forge fortune fossil fountain fox frost fruit galaxy gallery garnet gateway
gauge gecko geyser ginger glacier glade glass gleam glen globe glow gold gorge
granite grape graphite grass grove guitar gully gust harbor harmony harp harvest
hawk hazel hearth heather hedge helix heron hickory highland hinge hollow
honey horizon hornbeam horsehound hostel humble iceberg icon indigo inlet iris iron
island ivory ivy jackal jade jasmine jasper jelly jewel juniper kayak kelp kernel
kestrel kettle keystone kiln kindle kiosk kite knoll lagoon lake lamp lantern lapis
larch lark latch lattice laurel lava leaf ledge legend lemon lentil lever lichen
lilac lily lime linen lion locket lodge loft logan lotus lucent lumber lunar lupine
lynx lyric magnet magnolia mahogany maize mallard maple marble marina marsh marlin
meadow medley melon mesa metal meteor midnight mint mirror mist molar monsoon moon
moor moose mortar moss moth mound mulberry mustard myrtle nectar needle nest nickel
nightfall nimbus noble north notch nova nutmeg oak oasis oat obsidian ocean ochre
olive onyx opal orbit orchard orchid ore osprey otter owl oxide paddle pagoda palm
panda pansy papaya paper parcel parlor parsley pastel path patio peacock peak pearl
pebble pecan pelican pepper petal pewter phoenix pier pigeon pine pinion piston
plains planet plateau plum plume pocket polar pollen pond poplar poppy prairie prism
pulsar pumice quarry quartz quill quince quiver rabbit radish raft raven ravine
reed reef relay relic ridge rift rill ripple river robin rock rose rosemary rowan
ruby rudder rustic saffron sage sail salmon salt sand sapphire satchel savanna
scallop scarlet scribe sea sequoia shade shell shelter sherry shield shore shrine
sierra signal silk silver slate slope snow solar solid sonnet south sparrow spice
spindle spire spring spruce spry star steel steppe stone storm strand
stream summit sunbeam sunset surf swallow swan sweetbriar sycamore table talon
tamarind tanager tangerine tapestry teak teal temple terrace thicket thistle thorn
thunder thyme tide timber tinder topaz tower trail trellis tributary trillium
trout truffle tulip tundra turquoise twilight umber umbra union upland urchin valley
vanilla velvet venture vessel vine violet vista vivid walnut wander warm wasp water
wave wax weather weaver well west whale wheat wheel whisper willow wind winter wolf
wombat wren yarrow yew zephyr zinc zinnia
`;

export const WORDLIST = Object.freeze(
  Array.from(
    new Set(
      RAW_WORDS.split(/\s+/)
        .map((word) => word.trim().toLowerCase())
        // Only clean lowercase alphabetic words are allowed in the bundle.
        .filter((word) => /^[a-z]{3,}$/.test(word)),
    ),
  ),
);

/** Bits of entropy contributed by one uniformly chosen word. */
export const WORD_ENTROPY_BITS = Math.log2(WORDLIST.length);
