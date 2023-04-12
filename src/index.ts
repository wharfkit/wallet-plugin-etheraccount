import detectEthereumProvider from '@metamask/detect-provider'
import {
    AbstractWalletPlugin,
    Action,
    Checksum256,
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    Serializer,
    Signature,
    TransactContext,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {ethers} from 'ethers'

const networks = {
    '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191': Number(95), //Kylin testnet
    aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906: Number(59), //EOS Mainnet
}

declare global {
    interface Window {
        ethereum: import('ethers').providers.ExternalProvider
    }
}

interface WalletPluginEtherAccountOptions {
    networks?: Record<string, number>
}

export class WalletPluginEtherAccount extends AbstractWalletPlugin implements WalletPlugin {
    /**
     * The networks this plugin is capable of working with
     */
    public networks: Record<string, number> = {
        '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191': Number(95), //Kylin testnet
        aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906: Number(59), //EOS Mainnet
    }

    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: true,

        // Should the user interface display a permission selector?
        requiresPermissionSelect: false,

        // Optionally specify if this plugin only works with specific blockchains.
        supportedChains: Object.keys(this.networks),
    }

    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = {
        name: 'Metamask (etheraccount)',
        description: 'Use the etheraccount smart contract with Metamask.',
        logo: 'base_64_encoded_image',
        homepage: 'https://forums.eoscommunity.org/t/eos-mainnet-is-now-available-on-metamask/4264',
        download: 'https://forums.eoscommunity.org/t/eos-mainnet-is-now-available-on-metamask/4264',
    }

    /**
     * A unique string identifier for this wallet plugin.
     *
     * It's recommended this is all lower case, no spaces, and only URL-friendly special characters (dashes, underscores, etc)
     */
    get id(): string {
        return 'wallet-plugin-etheraccount'
    }

    constructor(options?: WalletPluginEtherAccountOptions) {
        super()
        if (options) {
            if (options.networks) {
                this.networks = options.networks
            }
        }
    }

    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        // Ensure a chain has been specified for the login
        if (!context.chain) {
            throw new Error(
                'The WalletPluginEtherAccount plugin requires a chain to be selected before logging in.'
            )
        }

        // Ensure metamask/ethereum is available
        const provider = await detectEthereumProvider({mustBeMetaMask: true})
        if (!provider) {
            throw new Error('Metamask is required to use this plugin.')
        }

        const {ethereum} = window
        if (!ethereum || !ethereum.request) {
            throw new Error('The ethereum object was not loaded.')
        }

        // Map the chain id to the network id
        const chainId = await ethereum.request({method: 'eth_chainId'})
        if (!networks[String(context.chain.id)]) {
            throw new Error(
                'The specified chain is not supported by the WalletPluginEtherAccount plugin.'
            )
        }

        const networkId = networks[String(context.chain.id)]
        if (Number(chainId) !== Number(networkId)) {
            throw new Error(
                `The chainId (${Number(chainId)}) does not match the networkId (${Number(
                    networkId
                )}).`
            )
        }

        // Retrieve the current address from metamask
        const [address] = await ethereum.request({method: 'eth_requestAccounts'})
        if (!address) {
            throw new Error('Unable to get the current account during login.')
        }

        // Retrieve the table row associated to the address metamask returns
        const res = await context.getClient(context.chain).v1.chain.get_table_rows({
            code: 'etheraccount',
            scope: 'etheraccount',
            table: 'account',
            lower_bound: address.substr(2),
            upper_bound: address.substr(2),
            limit: 1,
            index_position: 'secondary',
            key_type: 'sha256',
            json: true,
        })

        // Ensure the account exists
        const [row] = res.rows
        if (!row) {
            throw new Error('An account does not exist for this address.')
        }

        // Build identity based on table row
        const identity = {
            eos_account: row.eos_account,
            eth_address: row.eth_address,
        }

        // Persist the identity data in the plugin
        this.data.identity = identity

        // Return the Antelope chain and permission level to use for this login.
        return {
            chain: context.chain.id,
            permissionLevel: PermissionLevel.from(`${identity.eos_account}@active`),
        }
    }
    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     *
     * @param chain ChainDefinition
     * @param resolved ResolvedSigningRequest
     * @returns Promise<Signature>
     */
    // TODO: Remove these eslint rule modifiers when you are implementing this method.
    /* eslint-disable @typescript-eslint/no-unused-vars */
    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        const actions = Serializer.encode({
            object: resolved.transaction.actions,
            type: 'action[]',
            customTypes: [Action],
        }).array
        console.log(actions)

        const {ethereum} = window
        if (!ethereum || !ethereum.request) {
            throw new Error('The ethereum object was not loaded.')
        }

        const provider = new ethers.providers.Web3Provider(ethereum)
        const signer = provider.getSigner()
        const abi = [
            'function pushEosTransaction(uint64 rp, bytes actions) returns (boolean)',
            'function getRp() view returns (uint64)',
        ]

        const address = '0xa1050456bf9f78d485445fb43aa2c6978f3aa5d5'
        const etheraccount = new ethers.Contract(address, abi, signer)

        const rp = await etheraccount.getRp()
        console.log(rp)

        const res = await etheraccount.pushEosTransaction(rp, actions)
        console.log(res)

        // return {
        //     wasBroadcast: true,
        //     transactionId: res.result,
        //     transaction: null,
        // }
        // Example response...
        return {
            signatures: [
                Signature.from(
                    'SIG_K1_KfqBXGdSRnVgZbAXyL9hEYbAvrZjcaxUCenD7Z3aX6yzf6MEyc4Cy3ywToD4j3SKkzSg7L1uvRUirEPHwAwrbg5c9z27Z3'
                ),
            ],
        }
    }
}
